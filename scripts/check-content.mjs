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

const SRC = process.env.CONTENT_DIR ?? '.';
const STRICT = new Set((process.env.CONTENT_STRICT ?? 'urls,schema').split(',').map((s) => s.trim()));
const on = (k) => STRICT.has('all') || STRICT.has(k);

const errors = [], warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);
const req = (k, f, m) => (on(k) ? err(f, m) : warn(f, m));

const asciiLower = (s) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
/** The year segment already keeps slugs away from sub-view names; this is a second line. */
const RESERVED = new Set(['essay', 'research', 'video', 'slides', 'podcast', 'index', 'page', 'tags', 'feed', 'about']);

const files = [];
{
  const d = path.join(SRC, 'content', 'writing');
  if (existsSync(d))
    for (const f of await readdir(d)) if (f.endsWith('.md') && !f.startsWith('_')) files.push(path.join(d, f));
}
if (files.length === 0) err('(all)', 'no markdown found under content — the checkout may have failed');

const seen = new Map();
for (const abs of files) {
  const rel = path.relative(SRC, abs).split(path.sep).join('/');
  const raw = await readFile(abs, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) { err(rel, 'missing front matter'); continue; }
  const fm = m[1];
  const get = (k) => (new RegExp(`^${k}:\s*(.*)$`, 'm').exec(fm)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');

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

  // Decks and tags are still being backfilled, so these are staged rather than hard errors.
  if (!get('deck')) req('deck', rel, 'deck is empty');
  if (/^tags:\s*\[\s*\]\s*$/m.test(fm)) req('tags', rel, 'tags is empty');

  // Every image the prose references must exist.
  for (const im of raw.matchAll(/\/uploads\/([^\s"')\]]+)/g)) {
    const key = im[1].replace(/[.,)]+$/, '');
    if (!existsSync(path.join(SRC, 'public', 'uploads', key))) req('uploads', rel, `referenced image is missing: /uploads/${key}`);
  }
}

console.log(`check-content: ${files.length} documents, ${seen.size} URLs, STRICT=${[...STRICT].join(',')}`);
for (const w of warns) console.log(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);
if (errors.length) { console.error(`\n${errors.length} error(s) — stopping the build.`); process.exit(1); }
console.log(`  ${warns.length} warning(s), 0 errors — passed`);
