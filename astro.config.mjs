// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Grammars that resolve the 10 fence languages the corpus actually uses.
 * Anything outside this list makes `ensureLanguagesLoaded` throw and **fails the build**,
 * which is better than a silent fallback like `[Shiki] The language "vi" doesn't exist`.
 * Aliases already ship in the Shiki bundle: bash/sh/zsh resolve to shellscript,
 * console resolves to shellsession.
 */
const LANGS = [
  'plaintext', 'bash', 'shellscript', 'shellsession',
  'ini', 'jsonc', 'json', 'mermaid', 'xml', 'python',
];

/**
 * Code block wrapper. Wraps `<pre>` in `<figure class="code">` and labels the language.
 *
 * Do not match on the class: it catches nothing. Astro's built-in transformer runs
 * before user transformers and rewrites `shiki` to `astro-code` in `class`
 * (the pre hook in @astrojs/internal-helpers/dist/shiki.js). The only stable contract
 * is `dataLanguage`, which that same hook sets directly.
 *
 * The root hook must leave **exactly one** child. Astro reads only the first child of
 * root, via `codeToHast(...).then((root) => root.children[0])`
 * (@astrojs/markdown-satteri/dist/satteri-processor.js).
 */
const codeBlock = {
  name: 'sqzer:code-block',
  root(root) {
    const pre = root.children[0];
    if (!pre || pre.type !== 'element' || pre.tagName !== 'pre') return;

    const lang = String(pre.properties?.dataLanguage ?? 'plaintext');
    // ```bash wrap — opt in per block, for things like log dumps whose lines cannot be kept.
    const wrap = /(^|\s)wrap(\s|$)/.test(String(this.options?.meta?.__raw ?? ''));

    // Shiki's tabindex="0" alone leaves a screen reader announcing this scroll region unnamed.
    pre.properties.role = 'group';
    pre.properties['aria-label'] = lang === 'plaintext' ? 'Code' : `${lang} code`;

    const children = [pre];
    // A fence with no language arrives as `plaintext`, which names nothing, so it gets no label.
    if (lang !== 'plaintext') {
      children.unshift({
        type: 'element',
        tagName: 'figcaption',
        properties: { className: ['code__lang'], 'aria-hidden': 'true' },
        children: [{ type: 'text', value: lang }],
      });
    }

    root.children = [{
      type: 'element',
      tagName: 'figure',
      properties: { className: ['code'], dataLanguage: lang, ...(wrap ? { dataWrap: '' } : {}) },
      children,
    }];
  },
};

export default defineConfig({
  site: 'https://blog.sqzer.com',
  output: 'static',
  // Every canonical URL ends in a trailing slash; the directory format emits dist/<path>/index.html.
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: {
    syntaxHighlight: { type: 'shiki', excludeLangs: ['math'] },
    shikiConfig: {
      // The css-variables theme emits token colors as `var(--astro-code-token-*)`, so the
      // OKLCH ladder in tokens.css drives syntax highlighting instead of a second palette.
      theme: 'css-variables',
      langs: LANGS,
      // ```vi in the corpus is journald.conf, not vim script. That is INI.
      langAlias: { vi: 'ini' },
      // Preserve lines by default. Folding is opt-in per block via ```<lang> wrap.
      wrap: false,
      transformers: [codeBlock],
    },
  },
});
