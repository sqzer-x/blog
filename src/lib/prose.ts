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
    .replace(/^---[\s\S]*?^---/m, '')
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
    const clean = t.replace(/[*_`]/g, '').replace(/\s+/g, ' ');
    return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…';
  }
  return '';
}

/** Date formatting, pinned to UTC: reading in local time shifts corpus dates by a day. */
const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric',
});
export const longDate = (iso: string): string => DATE_FMT.format(new Date(`${iso}T00:00:00Z`));
