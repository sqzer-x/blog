import type { APIContext } from 'astro';

/**
 * Written as an endpoint rather than dropped in public/ so the sitemap line is built from
 * `site` in astro.config.mjs. A robots.txt that names a hard-coded host is one rename away
 * from pointing at someone else's sitemap, and this domain has already moved once.
 *
 * Everything is allowed: the whole site is public and there is nothing here a crawler
 * should be kept out of. The file exists for the sitemap line, not to forbid anything.
 */
export function GET(context: APIContext) {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${new URL('sitemap-index.xml', context.site).href}`,
    '',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
