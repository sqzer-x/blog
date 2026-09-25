/**
 * build-info.mjs — lets the site state its own provenance.
 *
 * "Is my commit live yet?" is answered by the site itself rather than by the pipeline that
 * deployed it: every build publishes /build-info.json with the commit it was built from and
 * when, so the answer is whatever the live site serves.
 *
 * Content and code share one repository, so contentSha and appSha name the same commit.
 * CONTENT_DIR and CONTENT_SHA can still override the content side; nothing in this
 * repository or its workflow sets them.
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
