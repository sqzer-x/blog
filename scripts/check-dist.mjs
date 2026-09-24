/**
 * check-dist.mjs — the post-build check that every page meant to carry a body has one.
 *
 * The pages already refuse to build an entry that came back unrendered (src/lib/rendered.ts).
 * This reads the output instead of the inputs, so it still holds for a page that renders
 * content without going through that guard: it is the last look at what is about to be
 * uploaded. npm runs it after `npm run build`, which is what CI calls.
 *
 * Each container must exist as well as be non-empty. A class renamed in a template would
 * otherwise turn every check here into a silent pass.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = 'dist';
const errors = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const count = (s, re) => (s.match(re) ?? []).length;

// Posts: dist/writing/<year>/<slug>/index.html, one <div class="prose"> each.
const writing = path.join(DIST, 'writing');
const years = (await readdir(writing, { withFileTypes: true })).filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name));
let posts = 0;
for (const y of years) {
  for (const s of await readdir(path.join(writing, y.name), { withFileTypes: true })) {
    if (!s.isDirectory()) continue;
    const rel = path.posix.join('writing', y.name, s.name, 'index.html');
    const html = await readFile(path.join(DIST, rel), 'utf8');
    posts++;
    const n = count(html, /<div class="prose">/g);
    if (n !== 1) err(rel, `expected one <div class="prose">, found ${n}`);
    else if (/<div class="prose">\s*<\/div>/.test(html)) err(rel, 'the post body is empty');
  }
}

// About: the whole of about.md goes into <article class="about">.
{
  const html = await readFile(path.join(DIST, 'index.html'), 'utf8');
  if (!html.includes('<article class="about">')) err('index.html', 'no <article class="about">');
  else if (/<article class="about">\s*<\/article>/.test(html)) err('index.html', 'the about body is empty');
}

// Code: one .project__about per project, each holding that file's body.
let projects = 0;
{
  const html = await readFile(path.join(DIST, 'code', 'index.html'), 'utf8');
  projects = count(html, /<li class="project"/g);
  const bodies = count(html, /<div class="project__about"[^>]*>/g);
  const empty = count(html, /<div class="project__about"[^>]*>\s*<\/div>/g);
  if (bodies !== projects) err('code/index.html', `${projects} projects but ${bodies} .project__about blocks`);
  if (empty) err('code/index.html', `${empty} project description(s) are empty`);
}

console.log(`check-dist: ${posts} post pages, about, ${projects} projects`);
for (const e of errors) console.error(`  ERROR ${e}`);
if (errors.length) { console.error(`\n${errors.length} error(s) — dist/ is not fit to deploy.`); process.exit(1); }
console.log('  every body is present — passed');
