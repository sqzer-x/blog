// @ts-check
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import satteriFigure from './src/lib/satteri-figure.mjs';
import satteriGuard from './src/lib/satteri-guard.mjs';
import satteriProse, { satteriHeadingScan } from './src/lib/satteri-prose.mjs';
import satteriDiagram from './src/lib/satteri-diagram.mjs';
import satteriKorean from './src/lib/satteri-korean.mjs';
import { diagramCopy, diagramKey, findMermaidFences, readDiagram } from './src/lib/diagrams.mjs';

/**
 * sha256 of the <style> inside every diagram copy a page will carry, for the
 * Content-Security-Policy below.
 *
 * Astro hashes the scripts and styles it emits itself, and once style-src carries a hash,
 * browsers ignore 'unsafe-inline' for <style> elements. The diagrams' own <style> arrives
 * inside Markdown HTML that Astro never looks at, so without these it would be blocked and
 * the diagram would lose its palette. A diagram drawn twice on one page is renamed for the
 * second copy, <style> included, so each copy is hashed as satteriDiagram will emit it:
 * through diagramCopy(), up to the most copies of that diagram any one document has. The
 * text is inlined verbatim with no entities, so it is hashed as it stands. prebuild bakes
 * any new diagram before this file is loaded, and check-dist fails the build if a page
 * still carries a <style> or <script> its policy does not list.
 */
function diagramCopies(dir, copies = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) diagramCopies(file, copies);
    else if (entry.name.endsWith('.md')) {
      const onPage = new Map();
      for (const { source } of findMermaidFences(readFileSync(file, 'utf8'))) {
        const key = diagramKey(source);
        onPage.set(key, (onPage.get(key) ?? 0) + 1);
      }
      for (const [key, n] of onPage) copies.set(key, Math.max(copies.get(key) ?? 0, n));
    }
  }
  return copies;
}
const DIAGRAM_STYLE_HASHES = [...diagramCopies('content')].flatMap(([key, n]) => {
  const svg = readDiagram(key);
  if (!svg) return [];
  return Array.from({ length: n }, (_, i) => diagramCopy(svg, key, i))
    .flatMap((markup) => [...markup.matchAll(/<style>([\s\S]*?)<\/style>/g)])
    .map(([, css]) => `sha256-${createHash('sha256').update(css).digest('base64')}`);
});

/**
 * Grammars preloaded into the Shiki highlighter: the fence languages the corpus uses.
 *
 * A warm-up list, NOT a gate — measured rather than assumed. A fence in a language outside
 * it still highlights (```rust emits data-language="rust" with real tokens), and a fence in
 * a language that exists nowhere logs `[Shiki] The language "notalanguage" doesn't exist,
 * falling back to "plaintext"`, emits data-language="plaintext" and leaves the build green.
 * An earlier note here claimed the opposite — that anything outside the list "fails the
 * build" — and nothing in this pipeline does that. What the list buys is that the languages
 * the corpus does use are resolved once at startup instead of on first sight.
 * Aliases already ship in the Shiki bundle: bash/sh/zsh resolve to shellscript,
 * console resolves to shellsession.
 *
 * `mermaid` is deliberately absent. It is the one entry left in excludeLangs below, so the
 * highlight plugin returns before Shiki is called: the grammar would be loaded and never
 * used, because a mermaid fence becomes a picture rather than highlighted source.
 */
const LANGS = [
  'plaintext', 'bash', 'shellscript', 'shellsession',
  'ini', 'jsonc', 'json', 'xml', 'python',
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
/**
 * Fence words whose grammar is not what the word says. `langAlias` below hands the
 * grammar to Shiki, but Shiki writes `dataLanguage` from the *unresolved* word, so
 * without this same map the wrapper labels a journald.conf block "vi" — a label that
 * is both visible in the figcaption and the hook every per-language CSS rule matches on.
 * One map, consumed in both places, is the only way those two stay in agreement.
 */
const ALIAS = { vi: 'ini' };

/**
 * Lines of 2,000 characters or more are not tokenised. Shiki checks its 500 ms time limit
 * between scans, and a single scan over a long bash line is already superlinear, so the
 * limit does not bound it: measured, a 20 KB printf line took 3.0 s and a 50 KB one 19.8 s,
 * and a few KB of `<<` threw RangeError, which emptied the post. Such a line now renders as
 * one uncoloured token. The corpus's longest fence line is 1,639 characters.
 */
const lineCap = {
  name: 'sqzer:line-cap',
  preprocess(code, options) {
    options.tokenizeMaxLineLength = 2000;
  },
};

const codeBlock = {
  name: 'sqzer:code-block',
  root(root) {
    const pre = root.children[0];
    if (!pre || pre.type !== 'element' || pre.tagName !== 'pre') return;

    const raw = String(pre.properties?.dataLanguage ?? 'plaintext');
    const lang = ALIAS[raw] ?? raw;
    // Re-stamp the pre so the attribute a reader is shown and the attribute CSS
    // matches on are the resolved grammar, not the author's word for it.
    pre.properties.dataLanguage = lang;
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
  /* The Hugo site this replaced shipped a sitemap and the migration lost it. robots.txt
     names it, so it has to exist: a robots line pointing at a 404 is the same defect as
     the <head> feed link that pointed at nothing. */
  integrations: [sitemap()],
  output: 'static',
  // Every canonical URL ends in a trailing slash; the directory format emits dist/<path>/index.html.
  trailingSlash: 'always',
  build: { format: 'directory' },
  /*
   * Content-Security-Policy, emitted by Astro as a <meta> in every page's <head>, since
   * GitHub Pages cannot send response headers. Astro computes the hashes of the scripts it
   * inlines, so editing the article's two scripts needs no change here.
   *
   * Nothing on this site loads from another origin, so everything is 'self' or 'none'.
   * Shiki colours every token with a style="" attribute, so 'unsafe-inline' is granted to
   * style-src-attr and nowhere else; a style attribute cannot run script. That grant is
   * the answer to the "Shiki ... not compatible with Content Security Policy" warning
   * Astro prints on every build. What a <meta> cannot carry: frame-ancestors, report-uri
   * and sandbox are ignored there.
   *
   * Two things in the emitted policy are Astro's and not the site's. script-src always lists
   * five hashes for Astro's client-directive runtimes (idle, load, media, only, visible;
   * astro/dist/runtime/client/*.prebuilt.js), added even on a site with no islands, and
   * style-src lists sha256 of the empty string. Neither matches anything a page carries.
   * Astro writes the <meta> where it renders the head, after the preload and icon links and
   * before every stylesheet and script; check-dist holds it to that.
   */
  security: {
    csp: {
      directives: [
        "default-src 'none'",
        "img-src 'self'",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
      ],
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
        hashes: DIAGRAM_STYLE_HASHES,
      },
    },
  },
  markdown: {
    // Sätteri is the default Markdown processor in Astro 7, and `markdown.rehypePlugins`
    // now throws unless @astrojs/markdown-remark is installed alongside it. Plugins go
    // here instead, as Sätteri visitor objects.
    //   mdast: satteriKorean  — CommonMark inline rules that misfire on Korean prose
    //   mdast: satteriFigure  — <figure>/<figcaption> out of the corpus's own convention
    //   hast:  satteriGuard   — refuses raw HTML, heading attributes, link schemes and
    //                           image hosts a post must not carry; the build fails
    //   hast:  satteriHeadingScan — whether the post has an h1 or an h6; must precede satteriProse
    //   hast:  satteriProse   — heading demotion, intrinsic image size, table scrollers
    //   hast:  satteriDiagram — a mermaid fence -> the SVG baked from it before the build
    // Ordering matters: hastPlugins run after highlighting and BEFORE heading-id
    // collection, so `headings` from render() reports the demoted depths. satteriGuard
    // goes first, before satteriDiagram adds the one raw node the site trusts.
    processor: satteri({
      mdastPlugins: [satteriKorean(), satteriFigure()],
      hastPlugins: [satteriGuard(), satteriHeadingScan(), satteriProse({ publicDir: 'public' }), satteriDiagram()],
      /*
       * Parser flags. Astro hands Sätteri only `{ gfm, smartPunctuation }`. Every other
       * entry in `Features` defaults off except `frontmatter`, which Sätteri turns on unless
       * told otherwise (`features.frontmatter ?? true` in satteri/dist/compile.js). What is
       * listed here is the whole of the difference from stock, and each line is a defect
       * that was measurable in dist/.
       */
      features: {
        /*
         * Astro has already split the front matter off: the loader hands over the body,
         * trimmed (astro/dist/vite-plugin-markdown/content-entry-type.js). Left on, Sätteri
         * reads that body's first line as a second front-matter fence, so a post opening
         * with a `---` rule loses everything up to the next `---`, `...` or `+++` pair. It
         * drops without a log, and the page still has a body for the render guard to find.
         * Nothing reads what Sätteri would parse there: Astro's metadata.frontmatter is the
         * loader's own copy.
         */
        frontmatter: false,
        /*
         * Smart punctuation, minus the dash rule. Quotes and ellipses are worth having in
         * 70-odd lines of prose; the dash rule is not, because it does not know what a CLI
         * flag is. Measured in the built site before this line: journalctl's
         * `#### 시간 범위 지정 (--since, --until)` shipped as
         * `(–since, –until)`, an en dash a reader cannot paste into a shell. Only prose
         * outside backticks was ever affected — code spans and fences are untouched — but on
         * a sysadmin blog a flag named in a heading is normal writing, not markup.
         */
        smartPunctuation: { dashes: false },
        /*
         * `## Heading { #id }` sets the anchor. Without it the braces render as literal
         * text in the heading AND in the contents list, and the generated slug swallows
         * them (`…-custom-id-`). Now that every post is written to carry a contents rail,
         * an author needs a way to keep an anchor stable across a retitling. No corpus
         * heading contains a brace, so nothing existing changes shape.
         */
        headingAttributes: true,
        /*
         * Not enabled, and each is a decision rather than an oversight:
         *   math          0 real formulas in the corpus. The 2 `$…$` hits are shell
         *                 variables, and `singleDollarTextMath` is on by default — turning
         *                 math on would eat them.
         *   subscript     `~sub~` collides head-on with GFM strikethrough, which is the
         *                 very collision satteri-tilde exists to undo.
         *   superscript   `^x^` is unused, and ^ appears in regexes and shell prose.
         *   directive     `:::note` blocks need styling per directive to mean anything.
         *   wikilinks     no wiki.
         *   definitionList  0 in the corpus; a table or a list carries the same content.
         *   rawHtml       off, raw HTML stays an opaque `raw` node; on, it is re-parsed into
         *                 elements. Either way it is emitted verbatim: this flag sanitises
         *                 nothing. What limits raw HTML is satteriGuard.
         */
      },
    }),
    /*
     * `mermaid` is the only exclusion this file asks for: the fence has to survive
     * highlighting intact so satteriDiagram can swap in the SVG that
     * scripts/render-diagrams.mjs baked from it.
     *
     * `math` was listed here too and is gone because it never did anything. Astro ORs its
     * own `defaultExcludeLanguages = ["math"]` into this check unconditionally
     * (@astrojs/internal-helpers/dist/markdown.js), so math is excluded whether or not it
     * is named, and no value of this option — and no langAlias — can un-exclude it.
     *
     * What that costs, measured: an excluded language skips the highlight plugin, so a
     * ```math fence is the one construct in the language that arrives as a bare
     * `<pre><code>` with no plate, no scroll region and no copy control. Everything else
     * lands on the plate, including the two cases that look like they might not — an
     * indented code block and a fence with no language both come through as
     * figure.code[data-language=plaintext]. The corpus has 0 math fences and math parsing
     * is off, so this is left alone rather than fixed with a plugin; `.prose pre` in the
     * article template keeps the bare case from scrolling the page sideways.
     */
    syntaxHighlight: { type: 'shiki', excludeLangs: ['mermaid'] },
    shikiConfig: {
      // The css-variables theme emits token colors as `var(--astro-code-token-*)`, so the
      // OKLCH ladder in tokens.css drives syntax highlighting instead of a second palette.
      theme: 'css-variables',
      langs: LANGS,
      // ```vi in the corpus is journald.conf, not vim script. That is INI.
      langAlias: ALIAS,
      // Preserve lines by default. Folding is opt-in per block via ```<lang> wrap.
      wrap: false,
      transformers: [lineCap, codeBlock],
    },
  },
});
