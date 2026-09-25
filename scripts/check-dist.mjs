/**
 * check-dist.mjs — the post-build checks on what is about to be uploaded: every page meant
 * to carry a body has one, and every page's Content-Security-Policy allows what the page
 * actually inlines (see the Content-Security-Policy section).
 *
 * The pages already refuse to build an entry that came back unrendered (src/lib/rendered.ts).
 * This reads the output instead of the inputs, so it still holds for a page that renders
 * content without going through that guard: it is the last look at what is about to be
 * uploaded. npm runs it after `npm run build`, which is what CI calls.
 *
 * Each container must exist as well as be non-empty. A class renamed in a template would
 * otherwise turn every check here into a silent pass.
 */
import { createHash } from 'node:crypto';
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

/* Content-Security-Policy, on every page. Astro writes the <meta> and hashes what it emits,
   but a <style> or <script> it did not see (a diagram's, say) is dropped by the browser
   without a sound: the page ships and simply looks or behaves wrong. So each page must
   carry exactly one policy, nothing the policy governs may come before it, and every
   inline <style> and executable inline <script> must be listed in it by hash. */
const sha = (s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await htmlFiles(abs));
    else if (e.name.endsWith('.html')) out.push(abs);
  }
  return out;
}
let policed = 0;
for (const abs of await htmlFiles(DIST)) {
  const rel = path.relative(DIST, abs).split(path.sep).join('/');
  const html = await readFile(abs, 'utf8');
  const metas = [...html.matchAll(/<meta http-equiv="content-security-policy" content="([^"]*)">/gi)];
  if (metas.length !== 1) { err(rel, `expected one Content-Security-Policy <meta>, found ${metas.length}`); continue; }
  policed++;
  if (/<(?:script|style|base)\b|<link\b[^>]*\brel="stylesheet"/i.test(html.slice(0, metas[0].index)))
    err(rel, 'a script, style or <base> comes before the Content-Security-Policy <meta>, which does not govern it');
  const directives = new Map(
    metas[0][1].split(';').map((d) => d.trim().split(/\s+/)).filter((t) => t[0]).map(([name, ...values]) => [name, new Set(values)]),
  );
  const listed = (kind, hash) =>
    (directives.get(`${kind}-src-elem`) ?? directives.get(`${kind}-src`) ?? directives.get('default-src') ?? new Set()).has(hash);
  for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    if (!listed('style', sha(css))) err(rel, `an inline <style> (${css.length} chars) is not in the policy; the browser will drop it`);
  for (const [, attrs, js] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc=/i.test(attrs) || /\btype="application\/(?:ld\+)?json"/i.test(attrs)) continue;
    if (!listed('script', sha(js))) err(rel, `an inline <script> (${js.length} chars) is not in the policy; the browser will not run it`);
  }
}

console.log(`check-dist: ${posts} post pages, about, ${projects} projects; a complete policy on ${policed} pages`);
for (const e of errors) console.error(`  ERROR ${e}`);
if (errors.length) { console.error(`\n${errors.length} error(s) — dist/ is not fit to deploy.`); process.exit(1); }
console.log('  every body is present and every inline style and script is allowed — passed');
