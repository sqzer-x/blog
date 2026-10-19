/**
 * goodreads.mjs — the about page's reading list, read from Goodreads at build time.
 *
 * The page renders the books as its own markup rather than framing Goodreads' widget: a
 * frame cannot take the site's type or colours, and it had every visitor's browser call
 * Goodreads. Here the public RSS feed of the read shelf is fetched once per build, so the
 * page carries plain links and the Content-Security-Policy stays 'self'.
 *
 * The parsed list is committed as src/lib/goodreads.json. A build that cannot reach
 * Goodreads warns and builds from that copy instead of failing a deploy over a third-party
 * feed, and the list is then as old as the last commit of the file. The file is rewritten
 * only when the books change, so a routine build leaves no diff behind.
 *
 *   node scripts/goodreads.mjs    refresh src/lib/goodreads.json from the feed
 */
import { readFile, writeFile } from 'node:fs/promises';

const USER = '205369673';
const FEED = `https://www.goodreads.com/review/list_rss/${USER}?shelf=read`;
const OUT = 'src/lib/goodreads.json';

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, hex, dec, name) =>
    hex ? String.fromCodePoint(parseInt(hex, 16))
      : dec ? String.fromCodePoint(Number(dec))
      : ENTITY[name.toLowerCase()] ?? m);

/* Every field read here is a flat element, its text either bare or wrapped in CDATA. */
const field = (item, tag) => {
  const m = item.match(new RegExp(String.raw`<${tag}>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*</${tag}>`));
  return m ? decode((m[1] ?? m[2]).trim()) : '';
};

/* RFC 822 dates. The read date is a calendar day, sent as midnight UTC, so it is read
   back in UTC; read in local time it would land on the day before west of Greenwich. */
const day = (s) => (s ? new Date(s).toISOString().slice(0, 10) : null);

async function fetchBooks() {
  const res = await fetch(FEED, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  if (!xml.includes('<channel>')) throw new Error('the response is not an RSS feed');
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const id = field(item, 'book_id');
    return {
      id,
      title: field(item, 'title'),
      author: field(item, 'author_name'),
      rating: Number(field(item, 'user_rating')) || 0,
      readAt: day(field(item, 'user_read_at')),
      addedAt: day(field(item, 'user_date_added')),
      url: `https://www.goodreads.com/book/show/${id}`,
    };
  });
}

const old = await readFile(OUT, 'utf8').catch(() => null);
let books;
try {
  books = await fetchBooks();
} catch (e) {
  if (old === null) throw new Error(`goodreads: cannot read ${FEED} (${e.message}), and there is no ${OUT} to build from`);
  console.warn(`goodreads: cannot read the feed (${e.message}); building from the committed ${OUT}`);
  process.exit(0);
}
const json = JSON.stringify({ feed: FEED, books }, null, 1) + '\n';
if (json === old) console.log(`goodreads: ${books.length} books, unchanged`);
else {
  await writeFile(OUT, json);
  console.log(`goodreads: ${books.length} books, ${OUT} rewritten`);
}
