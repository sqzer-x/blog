/**
 * 목록 정렬 — date DESC → Intl.Collator('en') title → path.
 * 이 순서가 인덱스·피드·sitemap 을 동시에 결정한다. DB/파일시스템 순서에 맡기면 안 된다.
 */
const collator = new Intl.Collator('en');

export interface Sortable { data: { date: string; title: string }; id: string }

export function byHugoOrder<T extends Sortable>(a: T, b: T): number {
  if (a.data.date !== b.data.date) return a.data.date < b.data.date ? 1 : -1;
  const t = collator.compare(a.data.title, b.data.title);
  return t !== 0 ? t : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** 글의 정식 경로. 연도는 date 에서 파생된다. */
export const postUrl = (p: Sortable): string => `/writing/${p.data.date.slice(0, 4)}/${p.id}/`;
