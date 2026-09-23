/**
 * check-content.mjs — the pre-deploy content gate.
 *
 * Since pushing is the only way to publish, this is the only safety net the site has.
 *
 * Strictness is staged through CONTENT_STRICT:
 *   urls,schema  right after the migration, while decks and tags are still empty
 *   all          once the backfill is done. Raise it once and do not lower it again.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

const SRC = process.env.CONTENT_DIR ?? '.';
const STRICT = new Set((process.env.CONTENT_STRICT ?? 'urls,schema').split(',').map((s) => s.trim()));
const on = (k) => STRICT.has('all') || STRICT.has(k);

const errors = [], warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);
const req = (k, f, m) => (on(k) ? err(f, m) : warn(f, m));

/**
 * Read a content file, dropping a leading UTF-8 BOM.
 *
 * Windows editors write one by default — PowerShell's own `Out-File -Encoding utf8` does —
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

const files = [];
{
  const d = path.join(SRC, 'content', 'writing');
  /* Underscore files are deliberately NOT skipped, because Astro does not skip them: the
     glob loader in src/content.config.ts matches `*.md`, so a post parked as `_wip.md` is
     loaded, schema-checked and built into a page like any other. Skipping it here only
     meant the gate reported "0 errors — passed" and the build then died on
     InvalidContentEntryDataError, which names no field and points at line 0. Checking it
     costs nothing — there are no underscore files in this directory, and both templates
     live at content/ top level, outside this glob — and it puts the URL-collision and
     reserved-slug rules onto files that really do become URLs. The supported way to park
     a post is `draft: true`, which every page and the feed honour. */
  if (existsSync(d))
    for (const f of await readdir(d)) if (f.endsWith('.md')) files.push(path.join(d, f));
}
if (files.length === 0) err('(all)', 'no markdown found under content — the checkout may have failed');

const seen = new Map();
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
    const typed = (new RegExp('^' + k + ':[ \\t]*(.*)$', 'm').exec(fm) || [])[1] || '';
    const t = typed.trim();
    if (t.includes('#') && !t.startsWith('"') && !t.startsWith("'") && v.length < t.length - 1)
      warn(rel, `${k} is cut short at a "#": YAML read it as ${JSON.stringify(v)} — quote the whole value to keep the rest`);
  }
  /* `[ \\t]*`, and neither `\s*` nor the literal `s*` this used to be.
     `\s` inside a template literal is not an escape sequence — the backslash is dropped
     and the class becomes a literal `s*`, which works on every value that does not begin
     with an `s` immediately after the colon. Writing it `\\s*` fixes that and breaks
     something worse: `\s` matches newlines, so on a key with nothing after it the class
     runs past the end of the line and `(.*)` captures the NEXT key's line. A blank `deck:`
     then reads as `type:` — non-empty, and the missing-deck warning silently stops firing.
     Now that blank values are the template's normal state, that is the case to get right.
     A YAML key is separated from its value by spaces or tabs, on its own line. */
  const get = (k) => (new RegExp(`^${k}:[ \\t]*(.*)$`, 'm').exec(fm)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');

  const title = get('title');
  const date = get('date');
  if (!title) err(rel, 'missing title');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) err(rel, `date is not YYYY-MM-DD: ${date || '(none)'}`);

  const slug = asciiLower(path.basename(abs, '.md'));
  if (RESERVED.has(slug)) err(rel, `slug collides with a reserved name: ${slug}`);
  if (slug !== slug.normalize('NFC')) err(rel, 'filename is not NFC-normalised (decomposed Hangul jamo)');

  const url = `/writing/${date.slice(0, 4)}/${slug}/`;
  if (seen.has(url)) err(rel, `URL collision: ${url} (already taken by ${seen.get(url)})`);
  else seen.set(url, rel);

  /* Decks and tags are still being backfilled, so these are staged rather than hard
     errors — and they have to stay staged now that content/_template.md ships both of
     them blank, or copying the template would produce a post the gate refuses.

     Each counts three spellings of nothing as the same thing: the key absent, the key
     with nothing after it (YAML null, which is what the template ships) and an explicitly
     empty value. The schema absorbs all three to the same parsed value, so a gate that
     told them apart would be reporting on punctuation rather than on content. */
  if (!get('deck')) req('deck', rel, 'deck is empty');

  /* Tags have two YAML spellings and only one of them is on the key's own line:
     `tags: [a, b]` is visible to get(), a block sequence puts its items on the lines
     below. Looking only for `tags: []`, as this did, meant a post carrying no `tags:` key
     at all passed the check in silence — the absent case, not a rare one here. */
  const tagsInline = /^tags:[ \t]*(.*)$/m.exec(fm);
  const tagsBlock = /^tags:[ \t]*\r?\n[ \t]*-[ \t]*\S/m.test(fm);
  if (!tagsBlock && !(tagsInline && /[^\s[\],]/.test(tagsInline[1]))) req('tags', rel, 'tags is empty');

  // Every image the prose references must exist.
  for (const im of raw.matchAll(/\/uploads\/([^\s"')\]]+)/g)) {
    const key = im[1].replace(/[.,)]+$/, '');
    if (!existsSync(path.join(SRC, 'public', 'uploads', key))) req('uploads', rel, `referenced image is missing: /uploads/${key}`);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   content/_template.md — the blank every post is copied from.

   It is checked, but NOT as a post, and the `_` skip in the loop above stays exactly as
   it is. Every rule up there is a rule about a finished document — a title, a real date,
   a slug that does not collide with another post's URL — and a template that had to
   satisfy them would have to carry a title and a date, which is the one thing a blank
   cannot do. Running the post rules over it would mean the template can only exist in a
   state that is already a post.

   What is worth checking is whether it is still a usable blank, and that is three
   questions the post rules never ask. Is it well-formed, i.e. one `key: value` line per
   field. Does it offer every field the schema has — a field added to the schema and not
   to the template is a field no post will ever carry, because the template is where post
   front matter comes from, and nothing else would ever report that. And is every value
   actually blank: this file shipped `draft: true` and `date: 2026-01-01` until recently,
   which meant copying it produced a post silently dated to the template's own birthday
   and silently withheld from the site.

   The file is optional the way content/code is: absent, this block does nothing, so a
   checkout without it fails no differently than before.
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
           copied from the template — which is how `draft: true` once produced posts that
           built clean and were nowhere on the site — but it is also how an author keeps a
           default they actually want. Say it on every build; do not stop the deploy. */
        if (filled.length) warn(rel, `a value is left in ${filled.join(', ')} — every post copied from this template inherits it unread`);
      }
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   content/code — the Code index.

   A collection this script does not know about is not "probably fine": the gate is the
   only thing standing between a push and the live site, so an unlisted directory is
   content that ships unchecked. Astro's own schema in src/content.config.ts already
   rejects a malformed `url`, a missing `name` and a non-integer `order` — but only at
   build time, and this script runs in `prebuild`, before that. What the schema cannot see
   at all is an empty body, because the body is where the description lives here, and two
   projects claiming the same position in a hand-ranked list.

   The directory is optional on purpose: absent, the block does nothing, so a checkout
   without it fails no differently than before. `files.length === 0` above is the
   emptiness alarm, and it deliberately still counts only content/writing — seven project
   stubs are not evidence that the prose survived the checkout.
   ──────────────────────────────────────────────────────────────────────────── */
const codeFiles = [];
{
  const d = path.join(SRC, 'content', 'code');
  /* Not skipping underscore files, for the reason the writing loop above spells out: the
     code collection's loader is the same `*.md` glob, so it loads them too. */
  if (existsSync(d))
    for (const f of await readdir(d)) if (f.endsWith('.md')) codeFiles.push(path.join(d, f));
}

/** The same test src/content.config.ts applies, so the two cannot disagree about a link. */
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
for (const abs of codeFiles) {
  const rel = path.relative(SRC, abs).split(path.sep).join('/');
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

console.log(`check-content: ${files.length} documents, ${seen.size} URLs, ${codeFiles.length} code entries, STRICT=${[...STRICT].join(',')}`);
for (const w of warns) console.log(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);
if (errors.length) { console.error(`\n${errors.length} error(s) — stopping the build.`); process.exit(1); }
console.log(`  ${warns.length} warning(s), 0 errors — passed`);
