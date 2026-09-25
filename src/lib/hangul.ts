/** Jamo, compatibility jamo, extended jamo and the precomposed syllable block. */
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7A3\uD7B0-\uD7FF]/;

/** True when any of the strings would put a Hangul glyph on the page. */
export const hasHangul = (...parts: (string | null | undefined)[]): boolean =>
  parts.some((s) => !!s && HANGUL.test(s));

/**
 * `lang` for a single string, returned only when it differs from the document.
 * Re-declaring the document language on a child makes a screen reader switch voices
 * for no reason, so an agreeing value is dropped.
 */
export const langOf = (s: string, doc: 'en' | 'ko'): 'en' | 'ko' | undefined => {
  const l: 'en' | 'ko' = HANGUL.test(s) ? 'ko' : 'en';
  return l === doc ? undefined : l;
};

const HANGUL_ALL = new RegExp(HANGUL.source, 'g');

/**
 * The language a post is written in: the article's lang, and the baseline satteriLang
 * compares passages and headings against. Both call this on the same body, so they cannot
 * disagree.
 *
 * It follows the body, not the title, and is measured on prose only. The label drives
 * leading, line breaking and speech, so it has to describe what is read. Keying off the
 * title would mislabel AI Odyssey and VTZero; counting Hangul against every character
 * would mislabel the Korean technical posts, whose shell transcripts and URLs swamp the
 * prose — measured that way sysmon lands at 0.14 and journalctl at 0.29, both plainly
 * Korean documents. With fences and link targets dropped and Hangul weighed against Latin
 * letters, the corpus splits with nothing near the line: the two English essays sit at
 * 0.25 and 0.28, and the other 28 posts all sit at 0.50 or above.
 */
export function docLang(md: string): 'en' | 'ko' {
  // Linear on any input; see the note on LINK in prose.ts.
  const prose = md.replace(/```[\s\S]*?```/g, '').replace(/\[[^\][]*\]\((?:[^()]|\([^()]*\))*\)/g, '');
  const kor = (prose.match(HANGUL_ALL) ?? []).length;
  const lat = (prose.match(/[A-Za-z]/g) ?? []).length;
  return kor / Math.max(1, kor + lat) > 0.4 ? 'ko' : 'en';
}
