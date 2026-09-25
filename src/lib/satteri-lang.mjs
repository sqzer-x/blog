/**
 * satteri-lang — `lang` on the passages of a post that are not in the post's language.
 *
 * The article element carries one lang, docLang() of the body. A screen reader picks its
 * voice from lang (WCAG 3.1.2), so without this two kinds of passage are read in the wrong
 * one:
 *
 *   sections   The bilingual essays split themselves with a heading that reads exactly
 *              EN or KR. Everything after it, up to the next heading of the same level or
 *              higher, is in that language. AI Odyssey is an English document by its prose
 *              ratio, so its KR half — 1,754 Hangul characters — would be read by an
 *              English voice.
 *   headings   A heading in the other script, like the English h3s of a Korean post.
 *
 * Only top-level blocks and headings are marked, and only when they differ from the
 * article: a matching lang would make the reader switch voices for nothing. Paragraphs are
 * not judged one by one, because a single quoted Korean word would flip an English
 * paragraph. Code is left alone; it is not prose in either language.
 *
 * It runs last among the hast plugins, so it sees demoted headings and baked diagrams.
 */
import { docLang, langOf } from './hangul.ts';

const MARKERS = { EN: 'en', KR: 'ko' };
const isCode = (node) =>
  node.tagName === 'pre' || (node.tagName === 'figure' && [].concat(node.properties?.className ?? []).includes('code'));

export default function satteriLang() {
  return {
    name: 'lang',
    after(root, ctx) {
      const doc = docLang(ctx.source);
      let section = null;
      for (const node of root.children) {
        if (node.type !== 'element') continue;
        const depth = /^h[1-6]$/.test(node.tagName) ? Number(node.tagName[1]) : 0;
        if (depth) {
          if (section && depth <= section.depth) section = null;
          const text = ctx.textContent(node).trim();
          if (MARKERS[text]) {
            section = { lang: MARKERS[text], depth };
            continue;
          }
          const own = langOf(text, doc);
          if (own) ctx.setProperty(node, 'lang', own);
          continue;
        }
        if (section && section.lang !== doc && !isCode(node)) ctx.setProperty(node, 'lang', section.lang);
      }
    },
  };
}
