/**
 * prose.ts — derives typesetting decisions from the body of a post.
 *
 * Why read the body instead of the front matter: `type` is unset on all 30 posts and
 * `deck` is empty on all 30, so any branch that keys off front matter is dead code today.
 * The body already knows the shape of the document — how many subheadings it has and how
 * long its paragraphs run.
 */

/** Excluded from length and shape measurements: code fences, images, tables, link URLs. */
function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^\s*\|.*$/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

/** Keeps only lines outside code fences, so a `# comment` inside one is not read as a heading. */
function outsideFences(md: string): string {
  let inFence = false;
  const out: string[] = [];
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence) out.push(line);
  }
  return out.join('\n');
}

/*
 * `readingMinutes` stood here — 500 Korean characters plus 230 Latin words per minute,
 * printed as "N min read" in the article header. The header no longer carries a reading
 * estimate (the reference prints a title, a byline and a date and nothing else), and the
 * article template was its only caller, so it is deleted rather than left as an export
 * with no importer. `plain()` above is still read by both functions below.
 */

export type ProseShape = 'essay' | 'technical';
export type ProseRhythm = 'flow' | 'staccato';

/**
 * The typographic shape of a document.
 *
 * shape:
 *   technical — three or more subheadings; the headings are the structure (11 posts).
 *   essay     — no subheadings, or decorative ones; the paragraph flow is everything (19).
 *
 * rhythm:
 *   staccato  — no subheadings, median paragraph <= 60 characters, 8+ paragraphs.
 *               A 728px column at 20px fits about 36 Korean characters per line, so a
 *               60-character median is 1.7 lines. One-line paragraphs stacked at 24px
 *               intervals stop reading as prose and start reading as verse.
 *               (i-have-to: 69 paragraphs, median 40 chars; will-the-next: 92 at 45.)
 *               These switch from blank-line breaks to indented paragraphs in CSS.
 *   flow      — everything else; keeps blank-line paragraph breaks.
 *
 * Measured split: staccato 11, technical 11, flow-essay 8 = 30.
 */
export function proseShape(md: string): {
  shape: ProseShape;
  rhythm: ProseRhythm;
  paragraphs: number;
  medianChars: number;
} {
  const body = outsideFences(plain(md));
  const headings = (body.match(/^#{1,6}\s/gm) ?? []).length;

  const lengths: number[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (lines.length === 0) continue;
    // Headings, tables, quotes, lists and images are not paragraphs.
    if (/^[#|>\-*!]/.test(lines[0].trimStart())) continue;
    lengths.push(lines.join(' ').length);
  }
  lengths.sort((a, b) => a - b);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;

  return {
    shape: headings >= 3 ? 'technical' : 'essay',
    rhythm: headings === 0 && median <= 60 && lengths.length >= 8 ? 'staccato' : 'flow',
    paragraphs: lengths.length,
    medianChars: median,
  };
}

/**
 * Fallback excerpt used where a deck is missing. Because `deck` is empty on all 30 posts,
 * every page currently ships an empty `<meta name="description">` — a real defect in the
 * deployed build.
 */
export function excerpt(md: string, max = 160): string {
  const body = outsideFences(plain(md));
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.split('\n').filter((l) => l.trim()).join(' ').trim();
    if (!t || /^[#|>\-*!]/.test(t)) continue;
    const clean = readable(t).replace(/\s+/g, ' ').trim();
    return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…';
  }
  return '';
}

/**
 * One paragraph of Markdown as the text a reader sees, because that is what a description
 * is: search results, link previews and feed readers all show it as text. Code spans stay
 * exactly as written. Outside them the inline tags satteriGuard allows are dropped (a <br>
 * becomes a space), emphasis markers go, backslash escapes resolve, and entities decode, so
 * `AT&amp;T` reads AT&T and `<abbr title="…">ARP</abbr>` reads ARP. Every consumer escapes
 * what it receives: Astro for the meta attribute, the JSON-LD replace for `<`, and
 * index.xml.ts for the feed.
 *
 * Only the first 4,000 characters are read. The description keeps 160, and a first
 * paragraph can be a pasted log.
 */
function readable(md: string): string {
  const s = md.slice(0, 4000);
  // A run of n backticks opens a code span that the next run of exactly n closes: pair each
  // run with the next of its length, walking right to left once.
  const runs = [...s.matchAll(/`+/g)];
  const next = new Array<number>(runs.length).fill(-1);
  const last = new Map<number, number>();
  for (let i = runs.length - 1; i >= 0; i--) {
    next[i] = last.get(runs[i][0].length) ?? -1;
    last.set(runs[i][0].length, i);
  }
  let out = '';
  let from = 0;
  for (let i = 0; i < runs.length; i++) {
    if (next[i] < 0) continue;
    const open = runs[i];
    const close = runs[next[i]];
    out += inline(s.slice(from, open.index)) + s.slice(open.index! + open[0].length, close.index);
    from = close.index! + close[0].length;
    i = next[i];
  }
  return out + inline(s.slice(from));
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Prose outside code spans. */
const inline = (t: string): string =>
  t
    .replace(/<br[\t\n\f\r ]*\/?>/gi, ' ')
    .replace(/<\/?(?:kbd|mark|sub|sup|ins|abbr)\b[^>]*>/gi, '')
    .replace(/(?<!\\)[*_`]/g, '')
    .replace(/\\([!-/:-@[-`{-~])/g, '$1')
    .replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z]+);/g, (m, e: string) => {
      if (e[0] !== '#') return NAMED[e] ?? m;
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : '�';
    });

/** Date formatting, pinned to UTC: reading in local time shifts corpus dates by a day. */
const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric',
});
export const longDate = (iso: string): string => DATE_FMT.format(new Date(`${iso}T00:00:00Z`));
