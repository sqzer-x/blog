/**
 * build-info.mjs — lets the site state its own provenance.
 *
 * A deploy pipeline cannot be asked "is my commit live yet?", because the hook that starts
 * it carries no payload back. So the question is put to the site instead: it publishes the
 * commit it was built from, and a check reads that.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const SRC = process.env.CONTENT_DIR ?? '.';
const git = (args, cwd) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); }
  catch { return null; }
};
const info = {
  contentSha: process.env.CONTENT_SHA ?? git(['rev-parse', 'HEAD'], SRC),
  contentRef: git(['rev-parse', '--abbrev-ref', 'HEAD'], SRC),
  appSha: process.env.GITHUB_SHA ?? git(['rev-parse', 'HEAD'], '.'),
  builtAt: new Date().toISOString(),
};
await mkdir('public', { recursive: true });
await writeFile('public/build-info.json', JSON.stringify(info, null, 1) + '\n');
console.log(`build-info: content ${String(info.contentSha).slice(0, 8)} / app ${String(info.appSha).slice(0, 8)}`);
