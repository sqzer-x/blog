/**
 * build-info.mjs — 사이트가 자기 출처를 말하게 한다.
 *
 * 배포 훅/CI 는 payload 를 돌려주지 않으므로 "배포가 끝났는가"를 플랫폼에 물을 수 없다.
 * 대신 **라이브 사이트에 "너는 어느 content 커밋으로 지어졌나"** 를 묻는다.
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
