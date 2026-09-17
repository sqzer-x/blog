// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://blog.sqzer.com',
  output: 'static',
  // 정식 URL 은 전부 트레일링 슬래시로 끝난다. directory 포맷이 dist/<path>/index.html 을 만든다.
  // ⚠️ 프리렌더 페이지의 슬래시는 Astro 가 강제하지 않는다 — 실제 집행자는 vercel.json 이다.
  trailingSlash: 'always',
  build: { format: 'directory' },
});
