/**
 * check-content.mjs — the pre-deploy content gate.
 *
 * Since pushing is the only way to publish, this is the first of the site's safety nets.
 * It runs in prebuild, before Astro, as does scripts/render-diagrams.mjs, which stops the
 * build on a diagram it cannot bake; the render guards and scripts/check-dist.mjs come
 * after.
 *
 * Strictness is staged through CONTENT_STRICT, a comma-separated list:
 *   deck, tags   an empty deck, or empty tags, becomes an error instead of a warning
 *   all          both, once the backfill is done. Raise it once and do not lower it again.
 *   urls,schema  what CI passes today. URL, schema and missing-image checks are errors
 *                whatever the setting, so these two names switch nothing on; they are
 *                accepted so that value stays valid.
 * Any other name stops the gate: a typo must not quietly leave a check switched off.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

const SRC = process.env.CONTENT_DIR ?? '.';
const STRICT = new Set((process.env.CONTENT_STRICT ?? 'urls,schema').split(',').map((s) => s.trim()).filter(Boolean));
const on = (k) => STRICT.has('all') || STRICT.has(k);
const KEYS = new Set(['all', 'deck', 'tags', 'urls', 'schema']);
const unknownKeys = [...STRICT].filter((k) => !KEYS.has(k));
if (unknownKeys.length) {
  console.error(`check-content: unknown CONTENT_STRICT name(s): ${unknownKeys.join(', ')} (known: ${[...KEYS].join(', ')})`);
  process.exit(1);
}

const errors = [], warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);
const req = (k, f, m) => (on(k) ? err(f, m) : warn(f, m));

/**
 * Read a content file, dropping a leading UTF-8 BOM.
 *
 * Some Windows tools write one — Windows PowerShell's `Out-File -Encoding utf8` does —
 * and it lands in front of the opening `---`. Astro strips it and parses the file normally,
 * so a post carrying one builds and publishes correctly. Without this, every front-matter
 * regex below misses on the very first character and the gate stops the build with
 * `missing front matter` for a file whose front matter is plainly there: a message that
 * states the opposite of what is true, on a file the build would have accepted. The gate is
 * here to agree with the build, not to be stricter than it over an invisible byte.
 */
const read = async (p) => (await readFile(p, 'utf8')).replace(/^\uFEFF/, '');

const asciiLower = (s) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
/** The year segment already keeps slugs away from sub-view names; this is a second line. */
const RESERVED = new Set(['essay', 'research', 'video', 'slides', 'podcast', 'index', 'page', 'tags', 'feed', 'about']);

/* A file name is a URL segment (writing) or an entry id (code), so it is held to what
   survives as one: letters in any script, digits, - and _. Measured on a build: `#` in
   the name dropped the post from every page, the feed and the sitemap with exit 0; `%`
   shipped a URL GitHub Pages answers with 400; a space shipped a raw space in href. */
const FILENAME = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
const FILENAME_RULE = 'file name may use only letters, digits, - and _ (it becomes the address; #, %, ? or a space breaks or drops the page)';

/* The collection id is the file name with ASCII lowercased (src/content.config.ts), so
   Arp.md and arp.md are one id and the loader keeps only one of them. The two cannot sit
   side by side on Windows, but a commit made on Linux or in the web editor can add the
   second, and the build would then drop a post without saying which. */
const idClash = (ids, id, rel) => {
  if (ids.has(id)) err(rel, `has the same id as ${ids.get(id)} ("${id}"): the names differ only in letter case, and one of the two would not be built`);
  else ids.set(id, rel);
};

/* 2025-02-30 matches YYYY-MM-DD, and the loader rolls it over to March 2 and publishes it
   there; 2025-12-32 rolls into the next year's URL, which then never moves back. */
const realDate = (d) => {
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};

/* ── Images ──────────────────────────────────────────────────────────────────
   Every /uploads/ path a document references must exist in public/uploads, spelled
   exactly as on disk. Pages serves a case-sensitive file system, while existsSync on
   Windows says yes to Image.png for image.png, so each path segment is looked up in its
   directory listing instead.

   Only references that start a URL count: after `(`, a quote, `<`, `=` or whitespace,
   never after a host name, and never inside fenced code or a code span. A tutorial that
   quotes `curl http://host/uploads/shell.php` is not naming an image this site serves.
   The path is percent-decoded first, as the renderer does. A malformed escape such as
   `100%.png` makes the renderer throw and the build stop at that page
   (src/lib/rendered.ts), so it is an error here, where the message can name the path. */
const listings = new Map();
function listing(dir) {
  if (!listings.has(dir)) {
    let names = null;
    try { names = new Set(readdirSync(dir)); } catch { /* missing, or not a directory */ }
    listings.set(dir, names);
  }
  return listings.get(dir);
}
function existsExact(root, rel) {
  let dir = root;
  for (const part of rel.split('/')) {
    if (!part || part === '.' || part === '..' || !listing(dir)?.has(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

/** The text outside fenced code and code spans. One pass over the input, no backtracking. */
function outsideCode(md) {
  const kept = [];
  let fence = null;
  for (const line of md.split('\n')) {
    const run = /^[\s>]*(`{3,}|~{3,})/.exec(line);
    const rest = run ? line.slice(run.index + run[0].length) : '';
    if (fence) {
      if (run && run[1][0] === fence[0] && run[1].length >= fence.length && !rest.trim()) fence = null;
      continue;
    }
    // A backtick fence cannot carry a backtick in its info string; that line is prose.
    if (run && !(run[1][0] === '`' && rest.includes('`'))) { fence = run[1]; continue; }
    kept.push(line);
  }
  // Code spans, paired within one paragraph: an opening run of n backticks closes at the
  // next run of exactly n. Pairing across paragraphs would let two stray backticks hide
  // everything between them.
  return kept.join('\n').split(/\n[ \t]*\n/).map((block) => {
    const runs = [...block.matchAll(/`+/g)];
    const next = new Array(runs.length).fill(-1);
    const last = new Map();
    for (let i = runs.length - 1; i >= 0; i--) {
      next[i] = last.get(runs[i][0].length) ?? -1;
      last.set(runs[i][0].length, i);
    }
    let out = '', from = 0;
    for (let i = 0; i < runs.length; i++) {
      if (next[i] < 0) continue;
      out += block.slice(from, runs[i].index);
      from = runs[next[i]].index + runs[next[i]][0].length;
      i = next[i];
    }
    return out + block.slice(from);
  }).join('\n\n');
}

/* ── Sizes the renderer cannot take ──────────────────────────────────────────
   Sätteri's smart punctuation costs bytes x marks within one inline run: a paragraph, a
   list item, a heading. Measured: 85 KB took 1.4 s and 2 GB; from 88 KB of pasted JSON or
   169 KB of unfenced log the render throws and the build stops at that page; past about
   41,000 apostrophes in one run Node itself dies with no file named. The same text split
   into paragraphs costs nothing. So each run outside code is held under 16 KB and 400
   quote, & and ... marks, both far above any paragraph the corpus has. A table is held
   under 20,000 cells: Sätteri has no cell limit, and an 18 KB table 3,072 columns wide
   became a 94 MB page. Code fences are not runs; their long lines are left untokenised
   instead (astro.config.mjs). */
const RUN_BYTES = 16 * 1024;
const RUN_MARKS = 400;
const TABLE_CELLS = 20_000;
const DELIMITER_ROW = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/;
const STARTS_RUN = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|^#{1,6}(?:[ \t]|$)/;

function checkSizes(rel, body, firstLine) {
  const blocks = [];
  let block = null;
  let fence = null;
  body.replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
    const run = /^[\s>]*(`{3,}|~{3,})/.exec(line);
    const rest = run ? line.slice(run.index + run[0].length) : '';
    if (fence) {
      if (run && run[1][0] === fence[0] && run[1].length >= fence.length && !rest.trim()) fence = null;
      return;
    }
    const text = line.replace(/^[ \t>]*/, '');
    if (run && !(run[1][0] === '`' && rest.includes('`'))) { fence = run[1]; block = null; return; }
    if (!text.trim()) { block = null; return; }
    if (!block) blocks.push((block = { line: firstLine + i, lines: [] }));
    block.lines.push({ line: firstLine + i, text });
  });
  for (const b of blocks) {
    if (b.lines.some((l) => DELIMITER_ROW.test(l.text))) {
      const columns = b.lines[0].text.replace(/^\||\|$/g, '').split('|').length;
      const cells = columns * (b.lines.length - 1);
      if (cells > TABLE_CELLS)
        err(rel, `line ${b.line}: a table of ${cells.toLocaleString()} cells is over the ${TABLE_CELLS.toLocaleString()} the renderer can take; split it, or link the data as a file`);
      continue;
    }
    const runs = [];
    for (const l of b.lines) {
      if (!runs.length || STARTS_RUN.test(l.text)) runs.push({ line: l.line, text: '' });
      runs[runs.length - 1].text += `${l.text}\n`;
    }
    for (const r of runs) {
      const bytes = Buffer.byteLength(r.text, 'utf8');
      const marks = (r.text.match(/["'&]|\.\.\./g) ?? []).length;
      if (bytes > RUN_BYTES || marks > RUN_MARKS)
        err(rel, `line ${r.line}: a paragraph of ${(bytes / 1024).toFixed(1)} KB with ${marks} quote, & and ... marks is over the ${RUN_BYTES / 1024} KB / ${RUN_MARKS} limit, past which rendering slows quadratically and then fails; put a pasted log or JSON in a code fence, or split it into paragraphs`);
    }
  }
}

/* Two spellings, tried in this order at each position. `(</uploads/a b.png>)` is how
   CommonMark writes a destination with a space in it (screenshots are named that way by
   default), and it runs to the `>`; the bare form ends at the first space or delimiter. */
const UPLOAD_REF = /(?<=(?:^|[\s(])<)\/uploads\/([^<>\n]+)(?=>)|(?<=^|[\s(<"'=])\/uploads\/([^\s"'()<>\]]+)/gm;

function checkUploads(rel, raw) {
  for (const m of outsideCode(raw).matchAll(UPLOAD_REF)) {
    const key = (m[1] ?? m[2]).split(/[?#]/)[0].replace(/[.,]+$/, '');
    let file;
    try { file = decodeURI(key); } catch { err(rel, `image path is not valid percent-encoding: /uploads/${key}`); continue; }
    if (!existsExact(path.join(SRC, 'public', 'uploads'), file))
      err(rel, `referenced image is missing from public/uploads, or differs in case: /uploads/${key}`);
  }
}

const files = [];
{
  const d = path.join(SRC, 'content', 'writing');
  /* Underscore files are deliberately NOT skipped, because Astro does not skip them: the
     glob loader in src/content.config.ts matches `*.md`, so a post parked as `_wip.md` is
     loaded, schema-checked and built into a page like any other. Skipping it here would
     let the gate report "0 errors — passed" and the build then die on
     InvalidContentEntryDataError, which names no field and points at line 0. Checking it
     costs nothing — no file in this directory starts with `_`, and both templates live
     at content/ top level, outside this glob — and it puts the URL-collision and
     reserved-slug rules onto files that really do become URLs. The supported way to park
     a post is `draft: true`, which every page and the feed honour. */
  if (existsSync(d))
    for (const f of await readdir(d)) if (f.endsWith('.md')) files.push(path.join(d, f));
}
if (files.length === 0) err('(all)', 'no markdown found under content — the checkout may have failed');

const seen = new Map();
const writingIds = new Map();
for (const abs of files) {
  const rel = path.relative(SRC, abs).split(path.sep).join('/');
  const raw = await read(abs);
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) { err(rel, 'missing front matter'); continue; }
  const fm = m[1];

  /* Parse the front matter for real before reading it with regexes.
     The checks below read values by pattern, which answers "what did the author type" but
     never "is this YAML at all". That gap has one very likely victim: the template ships
     `deck: ""`, and typing a quoted phrase inside those quotes gives
     `deck: "Ratios: what's a "good" one?"`, which is not valid YAML. The regexes see a
     non-empty deck and pass it; the build then fails elsewhere with a message about a
     collection entry, naming neither the file nor the quote. Parsing here fails at the
     file, with a line number, before Astro is reached. */
  let parsed = null;
  try {
    parsed = parseYaml(fm);
    if (parsed !== null && typeof parsed !== 'object') throw new Error('front matter is not a set of key: value fields');
  } catch (e) {
    const where = e && e.mark && e.mark.line != null ? ` (front matter line ${e.mark.line + 1})` : '';
    err(rel, `front matter is not valid YAML${where}: ${String(e.message).split('\n')[0]}`);
    err(rel, '  a quote inside a quoted value has to be escaped: write the whole value in single quotes, or double the inner ones');
    continue;
  }

  /* An unquoted `#` opens a YAML comment, so `deck: Ratios of what # and why` keeps only
     "Ratios of what" and loses the rest on the page, in the meta description and in the
     feed. Nothing downstream can tell that from a deck that was always short, so the one
     place it can be noticed is here, by comparing what was typed against what parsed. */
  for (const [k, v] of Object.entries(parsed || {})) {
    if (typeof v !== 'string') continue;
    // The key is the author's text, so it is escaped before it becomes a pattern: unescaped,
    // `c++:` throws a SyntaxError naming no file, and a key like `(x+x+)+y` backtracks for
    // seconds per line.
    const typed = (new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[ \\t]*(.*)$', 'm').exec(fm) || [])[1] || '';
    const t = typed.trim();
    if (t.includes('#') && !t.startsWith('"') && !t.startsWith("'") && v.length < t.length - 1)
      warn(rel, `${k} is cut short at a "#": YAML read it as ${JSON.stringify(v)} — quote the whole value to keep the rest`);
  }
  /* `[ \\t]*`, and neither `\s*` nor `\\s*`.
     `\s` inside a template literal is not an escape sequence — the backslash is dropped
     and the class becomes a literal `s*`, which works on every value that does not begin
     with an `s` immediately after the colon. Writing it `\\s*` fixes that and breaks
     something worse: `\s` matches newlines, so on a key with nothing after it the class
     runs past the end of the line and `(.*)` captures the NEXT key's line. A blank `deck:`
     then reads as `type:` — non-empty, and the missing-deck warning silently stops firing.
     Blank values are the template's normal state, so that is the case to get right.
     A YAML key is separated from its value by spaces or tabs, on its own line. */
  const get = (k) => (new RegExp(`^${k}:[ \\t]*(.*)$`, 'm').exec(fm)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');

  const title = get('title');
  const date = get('date');
  if (!title) err(rel, 'missing title');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) err(rel, `date is not YYYY-MM-DD: ${date || '(none)'}`);
  else if (!realDate(date)) err(rel, `date is not a real calendar date: ${date}`);

  const slug = asciiLower(path.basename(abs, '.md'));
  if (!FILENAME.test(path.basename(abs, '.md'))) err(rel, FILENAME_RULE);
  if (RESERVED.has(slug)) err(rel, `slug collides with a reserved name: ${slug}`);
  if (slug !== slug.normalize('NFC')) err(rel, 'filename is not NFC-normalised (decomposed Hangul jamo)');
  idClash(writingIds, slug, rel);

  const url = `/writing/${date.slice(0, 4)}/${slug}/`;
  if (seen.has(url)) err(rel, `URL collision: ${url} (already taken by ${seen.get(url)})`);
  else seen.set(url, rel);

  /* Decks and tags are still being backfilled, so these are staged rather than hard
     errors — and they have to stay staged while content/_template.md ships both of them
     blank, or copying the template would produce a post the gate refuses.

     Each counts three spellings of nothing as the same thing: the key absent, the key
     with nothing after it (YAML null) and an explicitly empty value (`deck: ""` and
     `tags: []`, which is what the template ships). The schema absorbs all three to the
     same parsed value, so a gate that told them apart would be reporting on punctuation
     rather than on content. */
  if (!get('deck')) req('deck', rel, 'deck is empty');

  /* Tags have two YAML spellings and only one of them is on the key's own line:
     `tags: [a, b]` is visible to get(), a block sequence puts its items on the lines
     below. Looking only for `tags: []` would let a post carrying no `tags:` key at all
     pass the check in silence: the absent case, the first of the three above. */
  const tagsInline = /^tags:[ \t]*(.*)$/m.exec(fm);
  const tagsBlock = /^tags:[ \t]*\r?\n[ \t]*-[ \t]*\S/m.test(fm);
  if (!tagsBlock && !(tagsInline && /[^\s[\],]/.test(tagsInline[1]))) req('tags', rel, 'tags is empty');

  checkUploads(rel, raw);
  checkSizes(rel, raw.slice(m[0].length), m[0].split('\n').length);
}

/* ────────────────────────────────────────────────────────────────────────────
   content/_template.md — the blank every post is copied from.

   It is checked, but NOT as a post: it sits at content/ top level, outside the writing
   loop above. Every rule in that loop is a rule about a finished document — a title, a
   real date, a slug that does not collide with another post's URL — and a template that
   had to satisfy them would have to carry a title and a date, which is the one thing a
   blank cannot do. Running the post rules over it would mean the template can only
   exist in a state that is already a post.

   What is worth checking is whether it is still a usable blank, and that is three
   questions the post rules never ask. Is it well-formed, i.e. one `key: value` line per
   field. Does it offer every field the schema has — a field added to the schema and not
   to the template is a field no post will ever carry, because the template is where post
   front matter comes from, and nothing else would ever report that. And is every value
   actually blank: a template carrying `draft: true` and `date: 2026-01-01` produces
   posts silently dated to the template's own birthday and silently withheld from the
   site.

   The file is optional the way content/code is: absent, this block does nothing, so a
   checkout without it is checked exactly as if this block were not here.
   ──────────────────────────────────────────────────────────────────────────── */

/* The field list of the `writing` collection in src/content.config.ts, duplicated here on
   purpose and for the same reason isProjectUrl is duplicated below — this script runs in
   `prebuild`, before Astro has parsed anything. Keep the two in step. */
const WRITING_FIELDS = ['title', 'titleKo', 'date', 'deck', 'type', 'tags', 'draft'];

{
  const abs = path.join(SRC, 'content', '_template.md');
  const rel = 'content/_template.md';
  if (existsSync(abs)) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(await read(abs));
    if (!m) err(rel, 'missing front matter — the template is what post front matter is copied from');
    else {
      const fields = new Map();
      let shaped = true;
      for (const line of m[1].split(/\r?\n/)) {
        /* A whole-line comment is allowed here. This is the one file whose job is to
           explain itself, and forbidding the normal way to annotate YAML would be a strange
           rule for it — content/_template-code.md already annotates itself that way. */
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const kv = /^([A-Za-z][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
        if (!kv) { err(rel, `front matter is not one "key: value" line per field: ${line.trim()}`); shaped = false; break; }
        /* A trailing comment is not a value. `date:   # YYYY-MM-DD` is a blank field with a
           note beside it, and calling that filled would push the author into deleting the
           hints this file exists to carry. */
        fields.set(kv[1], kv[2].replace(/(^|\s)#.*$/, '').trim());
      }
      if (shaped) {
        const missing = WRITING_FIELDS.filter((k) => !fields.has(k));
        const extra = [...fields.keys()].filter((k) => !WRITING_FIELDS.includes(k));
        /* Blank, in the three spellings the schema absorbs, plus the empty list `tags`
           carries so that its shape is visible to whoever fills it in. */
        const filled = [...fields].filter(([, v]) => !/^(|""|''|\[\s*\])$/.test(v)).map(([k]) => k);
        if (missing.length) err(rel, `front matter is missing ${missing.join(', ')} — every field the schema offers belongs here, blank`);
        if (extra.length) err(rel, `front matter offers ${extra.join(', ')}, which the writing schema does not have`);
        /* A warning, not an error. A value left here is inherited unread by every post
           copied from the template — a `draft: true` left in it produces posts that build
           clean and are nowhere on the site — but it is also how an author keeps a default
           they actually want. Say it on every build; do not stop the deploy. */
        if (filled.length) warn(rel, `a value is left in ${filled.join(', ')} — every post copied from this template inherits it unread`);
      }
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   content/code — the Code index.

   A collection this script does not know about is not "probably fine": an unlisted
   directory is content that ships without any of the checks in this file. Astro's own
   schema in src/content.config.ts already rejects a malformed `url`, a missing `name`
   and a non-integer `order` — but only at build time, and this script runs in
   `prebuild`, before that. What the schema cannot see at all is an empty body, because
   the body is where the description lives here, and two projects claiming the same
   position in a hand-ranked list.

   The directory is optional on purpose: absent, the block does nothing, so a checkout
   without it is checked exactly as if this block were not here. `files.length === 0`
   above is the emptiness alarm, and it deliberately counts only content/writing — a
   handful of project stubs is not evidence that the prose survived the checkout.
   ──────────────────────────────────────────────────────────────────────────── */
const codeFiles = [];
{
  const d = path.join(SRC, 'content', 'code');
  /* Not skipping underscore files, for the reason the writing loop above spells out: the
     code collection's loader is the same `*.md` glob, so it loads them too. */
  if (existsSync(d))
    for (const f of await readdir(d)) if (f.endsWith('.md')) codeFiles.push(path.join(d, f));
}

/** The same test src/content.config.ts applies, kept in step with it by hand. */
const isProjectUrl = (v) => {
  if (v.startsWith('/')) return v.endsWith('/');
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
};

const orders = new Map();
const codeIds = new Map();
for (const abs of codeFiles) {
  const rel = path.relative(SRC, abs).split(path.sep).join('/');
  const base = path.basename(abs, '.md');
  if (!FILENAME.test(base)) err(rel, FILENAME_RULE);
  idClash(codeIds, asciiLower(base), rel);
  const raw = await read(abs);
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) { err(rel, 'missing front matter'); continue; }
  const [, fm, body] = m;
  /* Local, and `[ \\t]*` for the reason the writing loop's copy spells out: `\s` in a
     template literal degrades to a literal `s`, and `\\s` matches newlines, so a key with
     nothing after it captures the next key's line — a blank `name:` would read as `url:`
     and the missing-name error would never fire. */
  const get = (k) => (new RegExp(`^${k}:[ \\t]*(.*)$`, 'm').exec(fm)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');

  if (!get('name')) err(rel, 'missing name');

  const url = get('url');
  if (!url) err(rel, 'missing url');
  else if (!isProjectUrl(url))
    err(rel, `url is not an absolute http(s) URL with a dotted host, nor a site path ending in "/": ${url}`);

  /* The description IS the body on this collection, so an empty file is an entry that
     renders as a bare link with nothing under it. */
  if (!body.trim()) err(rel, 'description is empty — the body of the file is the sentence the page prints');
  checkUploads(rel, raw);
  checkSizes(rel, body, raw.slice(0, raw.length - body.length).split('\n').length);

  /* A duplicate `order` is a hard error rather than a warning. The page does break the
     tie — by name, then by id, so the build is deterministic either way — but on a list
     whose entire order is hand-written, two entries claiming one position means the page
     is not in the order its author wrote, and the fix is one character. Keyed through
     Number() so `07` and `7` collide, which is what YAML will hand the schema anyway. */
  const rawOrder = get('order');
  if (!/^-?\d+$/.test(rawOrder)) err(rel, `order is not an integer: ${rawOrder || '(none)'}`);
  else {
    const key = String(Number(rawOrder));
    if (orders.has(key)) err(rel, `order ${key} is already taken by ${orders.get(key)}`);
    else orders.set(key, rel);
  }
}

// about.md is the home page: its portrait lives in /uploads/ like any post image, and its
// prose goes through the same renderer.
{
  const abs = path.join(SRC, 'content', 'about.md');
  if (existsSync(abs)) {
    const raw = await read(abs);
    const fm = /^---\r?\n[\s\S]*?\r?\n---/.exec(raw);
    checkUploads('content/about.md', raw);
    checkSizes('content/about.md', fm ? raw.slice(fm[0].length) : raw, fm ? fm[0].split('\n').length : 1);
  }
}

console.log(`check-content: ${files.length} documents, ${seen.size} URLs, ${codeFiles.length} code entries, STRICT=${[...STRICT].join(',')}`);
for (const w of warns) console.log(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);
if (errors.length) { console.error(`\n${errors.length} error(s) — stopping the build.`); process.exit(1); }
console.log(`  ${warns.length} warning(s), 0 errors — passed`);
