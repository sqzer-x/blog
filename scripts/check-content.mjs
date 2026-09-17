/**
 * check-content.mjs — 배포 전 콘텐츠 게이트.
 *
 * CI/CD 가 배포 수단 그 자체가 되면서 이것이 **유일한 안전망**이다.
 * 자동 테스트 0개였던 이전 시스템의 자리를 대신한다.
 *
 * 단계적 엄격도: CONTENT_STRICT 로 어디까지 에러로 볼지 정한다.
 *   urls,schema  — 마이그레이션 직후(덱·태그가 아직 비어 있다)
 *   all          — 백필 완료 후. **한 번 올리면 다시 내리지 않는다**
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
/** 하위 뷰 이름과 충돌하면 라우트가 깨진다. 연도 세그먼트가 막아 주지만 방어선을 하나 더 둔다. */
const RESERVED = new Set(['essay', 'research', 'video', 'slides', 'podcast', 'index', 'page', 'tags', 'feed', 'about']);

const files = [];
{
  const d = path.join(SRC, 'content', 'writing');
  if (existsSync(d))
    for (const f of await readdir(d)) if (f.endsWith('.md') && !f.startsWith('_')) files.push(path.join(d, f));
}
if (files.length === 0) err('(전체)', 'content 에서 마크다운을 하나도 못 찾았다 — 체크아웃 실패일 수 있다');

const seen = new Map();
for (const abs of files) {
  const rel = path.relative(SRC, abs).split(path.sep).join('/');
  const raw = await readFile(abs, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) { err(rel, 'front matter 가 없다'); continue; }
  const fm = m[1];
  const get = (k) => (new RegExp(`^${k}:\s*(.*)$`, 'm').exec(fm)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');

  const title = get('title');
  const date = get('date');
  if (!title) err(rel, 'title 이 없다');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) err(rel, `date 가 YYYY-MM-DD 가 아니다: ${date || '(없음)'}`);

  const slug = asciiLower(path.basename(abs, '.md'));
  if (RESERVED.has(slug)) err(rel, `예약어와 충돌하는 슬러그: ${slug}`);
  if (slug !== slug.normalize('NFC')) err(rel, '파일명이 NFC 정규화되지 않았다 (한글 자모 분리)');

  const url = `/writing/${date.slice(0, 4)}/${slug}/`;
  if (seen.has(url)) err(rel, `URL 충돌: ${url} (이미 ${seen.get(url)})`);
  else seen.set(url, rel);

  // 덱·태그는 백필 전이므로 단계적으로만 강제한다
  if (!get('deck')) req('deck', rel, 'deck 이 비어 있다');
  if (/^tags:\s*\[\s*\]\s*$/m.test(fm)) req('tags', rel, 'tags 가 비어 있다');

  // 본문이 참조하는 이미지가 실제로 있는가
  for (const im of raw.matchAll(/\/uploads\/([^\s"')\]]+)/g)) {
    const key = im[1].replace(/[.,)]+$/, '');
    if (!existsSync(path.join(SRC, 'public', 'uploads', key))) req('uploads', rel, `참조된 이미지가 없다: /uploads/${key}`);
  }
}

console.log(`check-content: 문서 ${files.length}개 / URL ${seen.size}개 / STRICT=${[...STRICT].join(',')}`);
for (const w of warns) console.log(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);
if (errors.length) { console.error(`\n실패 ${errors.length}건 — 빌드를 중단한다.`); process.exit(1); }
console.log(`  경고 ${warns.length}건 / 에러 0건 — 통과`);
