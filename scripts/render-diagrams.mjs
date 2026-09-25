/**
 * render-diagrams.mjs — bakes every mermaid fence in the corpus to a committed SVG.
 *
 * Mermaid cannot be rendered without a browser. Under jsdom it does not merely look wrong,
 * it lays out wrong: with CSSOM, getBBox, getComputedTextLength and getScreenCTM all
 * shimmed it *succeeds* and hands back a flowchart 30x too wide (viewBox 42256 against the
 * real 1424) and sequence diagrams ~10% short, because text layout is diagram layout.
 *
 * So the browser is the one on the machine, driven over CDP with no dependency at all:
 * Node 22+ ships a global WebSocket, which is the entire protocol client. ubuntu-latest
 * preinstalls Google Chrome, and withastro/action is a composite action running on the
 * host, so CI has one in scope without a Puppeteer download.
 *
 * And it almost never runs. Each fence is keyed by a hash over its source and everything
 * that could move a pixel (src/lib/diagrams.mjs), the SVG is committed under that name, and
 * a build with every key present exits here before a browser is ever looked for. A cache
 * miss means an author changed a diagram: it renders locally, or on a machine with a
 * browser, and the result is committed. A miss with no browser anywhere is a hard error —
 * never a silently stale picture, which is the one failure mode a committed cache invites.
 *
 *   node scripts/render-diagrams.mjs            render what is missing, prune what is not used
 *   node scripts/render-diagrams.mjs --check     report only; exit 1 if anything is missing
 *   node scripts/render-diagrams.mjs --force     re-render everything (palette work)
 */
import { readdir, readFile, writeFile, mkdir, unlink, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {
  DIAGRAM_DIR,
  DIAGRAM_FONTS,
  MERMAID_CONFIG,
  MERMAID_VERSION,
  diagramFile,
  diagramKey,
  findMermaidFences,
  finishDiagram,
} from '../src/lib/diagrams.mjs';

const SRC = process.env.CONTENT_DIR ?? '.';
const CHECK = process.argv.includes('--check');
const FORCE = process.argv.includes('--force');
const RENDER_TIMEOUT_MS = 120_000;

/* ── 1. every fence in the corpus ─────────────────────────────────────────── */

/** content/ is prose and is never written here — only read. */
async function markdownFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await markdownFiles(abs));
    else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) out.push(abs);
  }
  return out;
}

const contentDir = path.join(SRC, 'content');
if (!existsSync(contentDir)) {
  console.error(`render-diagrams: no content directory at ${contentDir} — the checkout may have failed`);
  process.exit(1);
}

/** key -> { source, where }. Identical fences in two posts share one file. */
const wanted = new Map();
for (const abs of (await markdownFiles(contentDir)).sort()) {
  const rel = path.relative(SRC, abs).split(path.sep).join('/');
  for (const fence of findMermaidFences(await readFile(abs, 'utf8'))) {
    const key = diagramKey(fence.source);
    if (!wanted.has(key)) wanted.set(key, { source: fence.source, where: `${rel}:${fence.line}` });
  }
}

await mkdir(DIAGRAM_DIR, { recursive: true });
const onDisk = new Set(
  (await readdir(DIAGRAM_DIR).catch(() => [])).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)),
);

const missing = [...wanted].filter(([key]) => FORCE || !onDisk.has(key));
const orphans = [...onDisk].filter((key) => !wanted.has(key));

/* ── 2. prune, then decide whether a browser is needed at all ─────────────── */

if (!CHECK) {
  for (const key of orphans) {
    await unlink(diagramFile(key));
    console.log(`  pruned ${key}.svg — no fence hashes to it any more`);
  }
  if (orphans.length) await invalidateRenderedMarkdown();
}

const summary = `render-diagrams: ${wanted.size} fence(s), ${wanted.size - missing.length} cached`;

if (missing.length === 0) {
  console.log(`${summary}, 0 to render`);
  process.exit(0);
}

if (CHECK) {
  console.error(`${summary}, ${missing.length} MISSING:`);
  for (const [key, { where }] of missing) console.error(`  ${where} -> ${diagramFile(key)}`);
  console.error('\nRun: npm run diagrams');
  process.exit(1);
}

/* ── 3. a browser, or a loud failure ──────────────────────────────────────── */

/** CHROME_PATH is the variable Lighthouse, karma and chrome-launcher all read. */
function findBrowser() {
  const listed = [process.env.CHROME_PATH, process.env.CHROME_BIN].filter(Boolean);
  const byPlatform = {
    win32: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
    ],
  };
  for (const candidate of [...listed, ...(byPlatform[process.platform] ?? [])]) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

const browser = findBrowser();
if (!browser) {
  console.error(`${summary}, ${missing.length} to render — but no Chrome or Chromium was found.`);
  for (const [key, { where }] of missing) console.error(`  ${where} -> ${diagramFile(key)}`);
  console.error(
    '\nA mermaid diagram is laid out by measuring text, so rendering one needs a real browser.\n' +
    'Install Chrome, or point CHROME_PATH at one, then run `npm run diagrams` and commit\n' +
    `the files it writes to ${DIAGRAM_DIR}/.`,
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
let mermaidBundle;
try {
  const installed = require('mermaid/package.json').version;
  if (installed !== MERMAID_VERSION) {
    console.error(
      `render-diagrams: mermaid ${installed} is installed but src/lib/diagrams.mjs keys diagrams to ` +
      `${MERMAID_VERSION}. Update MERMAID_VERSION and re-render, or reinstall ${MERMAID_VERSION}.`,
    );
    process.exit(1);
  }
  // The UMD build, deliberately: it is one self-contained file with no dynamic imports,
  // which is what makes it injectable into a page over CDP with nothing to serve.
  mermaidBundle = await readFile(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8');
} catch {
  console.error('render-diagrams: mermaid is not installed. It is a devDependency, used only here — run `npm install`.');
  process.exit(1);
}

/* ── 4. CDP, with a global WebSocket and nothing else ─────────────────────── */

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error(`cannot attach to ${wsUrl}`));
  });
  let seq = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const waiter = message.id && pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  };
  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    }),
    close: () => socket.close(),
  };
}

/**
 * `promise`, or a rejection after `ms`. The timer is cleared either way: a bare
 * Promise.race leaves it pending, and Node then stays alive until it fires, which would
 * hold every successful render open for the full two-minute render budget.
 */
function within(promise, ms, message) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

const started = Date.now();
// A throwaway profile per run, so a Chrome the author already has open cannot be joined
// (which would hand back a browser whose fonts and flags are not the ones set here).
const profile = path.join(os.tmpdir(), `render-diagrams-${process.pid}`);
await mkdir(profile, { recursive: true });
const child = spawn(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',              // the CI runner is already a throwaway container-shaped VM
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--remote-debugging-port=0', // the port is read back off stderr, so parallel runs cannot clash
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const fail = (message) => {
  try { child.kill(); } catch { /* already gone */ }
  console.error(`render-diagrams: ${message}`);
  process.exit(1);
};
// Nothing below may block a deploy forever: a dead socket would otherwise leave every
// `page.send` waiting on a reply that never comes, with no output and no exit.
const watchdog = setTimeout(() => fail('the browser stopped responding'), RENDER_TIMEOUT_MS * 2);
child.on('error', (error) => fail(`could not start ${browser} — ${error.message}`));

const wsUrl = await within(
  new Promise((resolve) => {
    let buffered = '';
    child.stderr.on('data', (chunk) => {
      buffered += chunk;
      const match = buffered.match(/ws:\/\/\S+/);
      if (match) resolve(match[0]);
    });
  }),
  30_000,
  'timeout',
).catch(() => fail(`${browser} started but never announced a debugging endpoint`));

const origin = wsUrl.replace('ws://', 'http://').replace(/\/devtools.*/, '');
const targets = await (await fetch(`${origin}/json/list`)).json();
const page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);

// A data: URL rather than a file: one, so nothing on disk is implied and no server is needed.
await page.send('Page.navigate', {
  url: 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><body></body>'),
});
await new Promise((resolve) => setTimeout(resolve, 200));

// Injected as an expression, not as a <script> in the page's markup: the minified bundle
// contains character sequences the HTML parser ends a script element on, and the page then
// reports `mermaid is not defined`. mermaid.min.js assigns globalThis.mermaid on its last line.
const loaded = await page.send('Runtime.evaluate', { expression: mermaidBundle, returnByValue: false });
if (loaded.exceptionDetails) fail(`mermaid failed to load: ${loaded.exceptionDetails.text}`);

const faces = [];
for (const font of DIAGRAM_FONTS) {
  const file = path.join(SRC, font.file);
  if (!existsSync(file)) fail(`${font.file} is missing — diagram text would be measured in a system font`);
  faces.push({ ...font, data: (await readFile(file)).toString('base64') });
}

const job = {
  config: MERMAID_CONFIG,
  faces: faces.map((f) => ({ family: f.family, data: f.data, descriptors: f.descriptors })),
  fences: missing.map(([key, { source, where }]) => ({ id: `mmd-${key}`, source, where })),
};

const expression = `(async () => {
  const job = ${JSON.stringify(job)};
  for (const face of job.faces) {
    const f = new FontFace(face.family, 'url(data:font/woff2;base64,' + face.data + ') format("woff2")', face.descriptors);
    await f.load();
    document.fonts.add(f);
  }
  await document.fonts.ready;
  mermaid.initialize(job.config);
  const out = [];
  for (const fence of job.fences) {
    document.body.innerHTML = '';
    try {
      const { svg } = await mermaid.render(fence.id, fence.source);
      out.push({ id: fence.id, svg });
    } catch (error) {
      out.push({ id: fence.id, error: String(error && error.message || error) });
    }
  }
  return JSON.stringify(out);
})()`;

const result = await within(
  page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
  RENDER_TIMEOUT_MS,
  'render timed out',
).catch((error) => fail(error.message));

if (result.exceptionDetails) fail(`render failed: ${JSON.stringify(result.exceptionDetails).slice(0, 800)}`);

clearTimeout(watchdog);
page.close();
child.kill();
await rm(profile, { recursive: true, force: true }).catch(() => { /* Chrome may still hold it */ });

/* ── 5. write, and account for it ─────────────────────────────────────────── */

const rendered = JSON.parse(result.result.value);
const failures = [];
let bytes = 0;

for (let i = 0; i < missing.length; i++) {
  const [key, { where }] = missing[i];
  const svg = rendered[i];
  if (svg.error || !svg.svg?.startsWith('<svg')) {
    failures.push(`  ${where}: ${svg.error ?? 'mermaid returned something that is not an SVG'}`);
    continue;
  }
  // LF and a final newline: .gitattributes normalises the working tree to LF, and a file
  // that ends without one shows up as a whole-file diff on the next platform that touches it.
  const file = diagramFile(key);
  const text = finishDiagram(svg.svg, `mmd-${key}`).replace(/\r\n?/g, '\n').trimEnd() + '\n';
  await writeFile(file, text, 'utf8');
  bytes += Buffer.byteLength(text);
  console.log(`  rendered ${where} -> ${file} (${Buffer.byteLength(text).toLocaleString()} B)`);
}

if (failures.length) {
  console.error(`\nrender-diagrams: ${failures.length} fence(s) did not render:`);
  for (const line of failures) console.error(line);
  process.exit(1);
}

await invalidateRenderedMarkdown();

console.log(
  `${summary}, ${missing.length} rendered in ${Date.now() - started} ms ` +
  `(${bytes.toLocaleString()} B of SVG) using ${browser}`,
);
if (process.env.CI) {
  console.log('  note: these were rendered on CI, so the committed cache is behind — run `npm run diagrams` and commit.');
}
// Explicit, like every other exit path in this file. On Windows a Chrome that is slow to
// die can hold the stderr pipe or the CDP socket open for minutes after the work is done.
process.exit(0);

/**
 * Astro's content layer caches rendered Markdown keyed on the *Markdown* file's digest, and
 * the SVG is inlined into that HTML. `npm run build` passes --force and re-renders every
 * entry regardless, but `astro dev` and a build without --force read the store: re-bake a
 * diagram without touching the prose and they serve the previous picture — the one failure
 * this whole design exists to prevent. So a bake drops the store: it is a cache, the
 * rebuild costs a second, and it only happens on the rare run that changed a diagram in
 * the first place.
 */
async function invalidateRenderedMarkdown() {
  for (const store of ['node_modules/.astro/data-store.json', '.astro/data-store.json']) {
    const file = path.join(SRC, store);
    if (!existsSync(file)) continue;
    await unlink(file);
    console.log(`  dropped ${store} so the pages holding these diagrams re-render`);
    if (!process.env.CI) console.log('  (a dev server that is already running keeps its own copy — restart it)');
  }
}
