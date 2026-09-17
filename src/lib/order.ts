/**
 * Ordering: date DESC, then title by Intl.Collator('en'), then path.
 *
 * This single order drives the index, the feed and the sitemap at once, so it must never
 * be delegated to filesystem or database order. Sorting by raw code points instead would
 * put `TSO` ahead of `journalctl` and silently reshuffle a whole year of posts.
 */
const collator = new Intl.Collator('en');

export interface Sortable { data: { date: string; title: string }; id: string }

export function byHugoOrder<T extends Sortable>(a: T, b: T): number {
  if (a.data.date !== b.data.date) return a.data.date < b.data.date ? 1 : -1;
  const t = collator.compare(a.data.title, b.data.title);
  return t !== 0 ? t : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Canonical path for a post. The year is derived from the front matter date. */
export const postUrl = (p: Sortable): string => `/writing/${p.data.date.slice(0, 4)}/${p.id}/`;
