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
