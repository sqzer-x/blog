import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { byHugoOrder, postUrl } from '../lib/order';
import { excerpt } from '../lib/prose';

/**
 * The feed, at the one address the site has always claimed.
 *
 * Every page's <head> has carried `<link rel="alternate" type="application/rss+xml"
 * href="/index.xml">` since the migration, and nothing answered it — a reader who
 * subscribed got a 404 from a link the site itself printed. This is that file.
 *
 * One feed, not one per section: the section feeds the Hugo site shipped were dropped
 * deliberately, and a blog that publishes into a single stream has nothing to split.
 *
 * Ordering and addresses come from src/lib/order.ts rather than being restated here, so
 * the feed cannot drift from the Writing index. Descriptions reuse the same excerpt()
 * the page's own <meta name="description"> uses, which means a post that gains a `deck`
 * improves both at once.
 *
 * XML escaping is @astrojs/rss's, not ours. The corpus is full of the characters that
 * break hand-rolled XML: ampersands in shell pipelines, angle brackets in log output,
 * quotes and em-dashes in Korean prose.
 *
 * HTML escaping is ours. A reader XML-decodes <description> and then renders it as HTML,
 * but the excerpt is plain text: a first paragraph quoting `<img src=x onerror=…>` in a
 * code span would come out of the reader as a live element. Escaping & < > before
 * @astrojs/rss escapes again makes the reader show it as the text it is.
 */
const asHtmlText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export async function GET(context: APIContext) {
  const posts = (await getCollection('writing'))
    .filter((p) => !p.data.draft)
    .sort(byHugoOrder);

  return rss({
    title: 'sqzer',
    description: 'Notes on systems, networks, and the things around them.',
    // context.site is astro.config.mjs's `site`. Required: every link in a feed is absolute.
    site: context.site!,
    items: posts.map((p) => ({
      title: p.data.title,
      // Dates are stored YYYY-MM-DD and read as UTC everywhere on this site; parsing them
      // in local time moves half the corpus back a day.
      pubDate: new Date(`${p.data.date}T00:00:00Z`),
      description: asHtmlText(p.data.deck ?? excerpt(p.body ?? '')),
      link: postUrl(p),
    })),
    customData: '<language>en</language>',
  });
}
