/**
 * diagrams — the contract between the step that bakes mermaid fences into SVG
 * (scripts/render-diagrams.mjs) and the plugin that puts the result back into the page
 * (src/lib/satteri-diagram.mjs). Both sides import this file, so a diagram is keyed the
 * same way from either end.
 *
 * Why bake at all. Mermaid lays a diagram out by *measuring text*, so the geometry it
 * emits belongs to whatever font did the measuring. Measured in a browser, the string
 * "클라이언트 검열 프로브 위장 핸드셰이크" at 16px is 251.1px in this site's own KoBody,
 * 266.3px in a default serif and 294.5px in Malgun Gothic — a 17.3% spread, and every box
 * in the picture is sized around that number. Loading public/fonts before rendering is
 * therefore not a nicety: it is what makes a Windows dev box and an Ubuntu runner produce
 * identical SVG, because no system font is ever consulted.
 *
 * The cache key is a hash over the fence source *and* everything else that could move a
 * pixel — schema version, mermaid config, palette, and the content-hashed font filenames.
 * Re-subset a face and its filename changes, so every diagram invalidates itself. Nothing
 * here needs a manifest: the key *is* the filename.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Committed, because a build must never need a browser. See scripts/render-diagrams.mjs. */
export const DIAGRAM_DIR = 'src/lib/diagrams';

/** Bump when the baked SVG's own markup changes shape (ids, root attributes, wrapper). */
export const DIAGRAM_SCHEMA = 2;

/**
 * The renderer is part of the geometry, so it is part of the key: a mermaid upgrade
 * re-renders every diagram rather than leaving new ones drawn by a different version than
 * their neighbours. Stated here rather than read from the package so the plugin side never
 * has to resolve a devDependency; scripts/render-diagrams.mjs asserts the two agree.
 */
export const MERMAID_VERSION = '12.0.0';

/**
 * The faces to load into the render browser, matching the @font-face rules in
 * src/styles/fonts.css exactly — including KoBody's size-adjust, without which every
 * Hangul label is measured 6% too wide and the boxes are drawn to match.
 */
export const DIAGRAM_FONTS = [
  { family: 'Lora', file: 'public/fonts/latin-9bba8f25.woff2', descriptors: { weight: '400 700' } },
  {
    family: 'KoBody',
    file: 'public/fonts/ko-02f8cebd.woff2',
    descriptors: {
      weight: '400 700',
      sizeAdjust: '94.29%',
      unicodeRange: 'U+1100-11FF, U+3130-318F, U+A960-A97F, U+AC00-D7A3, U+D7B0-D7FF',
    },
  },
];

/**
 * --font-body, spelled out. The stack is baked into the SVG's own style block, so the
 * fallback names have to be here too: a reader whose webfont has not landed yet gets
 * KoFallback, whose metric overrides in fonts.css are tuned to KoBody, rather than a raw
 * Malgun Gothic that would not fit the boxes this file measured.
 */
const FONT_STACK = "'Lora', 'KoBody', 'KoFallback', 'LatinFallback', Georgia, 'Times New Roman', serif";

/* tokens.css, resolved. SVG cannot carry a var(), so these are the literals it computes to. */
const INK = '#000000';         /* --page-fg */
const PLATE = '#faedda';       /* --sand */
const PAGE = '#fffbf4';        /* --sand-light */
const BORDER = '#eed6aa';      /* --sand-dark */
const HAIRLINE = '#b9b8ad';    /* --grey */
const RULE = '#605a4e';        /* --slate */
const WASH = '#f5eee0';        /* --slate-wash */
const ACCENT = '#a51c30';      /* --crimson */
const ACCENT_WASH = '#f7ebeb'; /* --crimson-wash */

/**
 * The config every fence is rendered with.
 *
 * htmlLabels: false is the load-bearing line. With HTML labels mermaid puts a <p> inside a
 * <foreignObject>, which is live HTML sitting inside .prose: every `.prose p` rule would
 * apply to it, and the reader's browser would re-wrap that text at read time inside a box
 * whose size was frozen at build time. SVG text is measured once, here, and cannot reflow.
 * A <br/> inside a label still breaks the line.
 *
 * useMaxWidth: false keeps the width/height attributes mermaid measured on the root, which
 * is what gives the baked SVG an intrinsic ratio. The fitting itself is CSS's - base.css
 * scales the picture into the column with `max-inline-size: 100%` - so mermaid's own
 * `width="100%" style="max-width:Npx"` variant would only be a second, weaker way of saying
 * the same thing, and it would take the measurement off the file on its way out.
 *
 * sequence.wrap: true is what makes that fitting affordable, and it is the one setting here
 * that changes a drawing rather than its colours. A sequence diagram's width is set by its
 * widest message label: unwrapped, "FakeIP 198.18.x.x (실제 해석 안 함 → 유출 0)" alone
 * holds two lifelines ~380px apart, and five actors of that turn into 1,540px that has to be
 * scaled 0.58 to reach a 928px column - 16px labels at 9.3px. Wrapped, the same two diagrams
 * come out 660x780 (fits with no scaling at all) and 1,194x958 (scales 0.75, labels at 12px).
 * Height is the price, and it is the right one: a page scrolls down already.
 *
 * It does re-break text the author did not break, which is the thing flowchart.wrappingWidth
 * above is set to 400 to avoid. The two are not the same call. A <br/> in a flowchart label
 * is the author drawing a box; a long sentence on an arrow is prose, and mermaid breaks it on
 * spaces, so the Korean labels here wrap where their words already end.
 */
export const MERMAID_CONFIG = {
  startOnLoad: false,
  // The SVG is injected as markup, so mermaid's own DOMPurify pass stays in the loop.
  securityLevel: 'strict',
  theme: 'base',
  // mermaid 12 defaults to look: 'neo', which hangs a drop shadow off notes and label
  // boxes. This page's whole graphic vocabulary is a 4px rule and a 1px hairline.
  look: 'classic',
  fontFamily: FONT_STACK,
  htmlLabels: false,
  // wrappingWidth is 120px by default, which re-breaks lines the author already broke with
  // <br/>: "VLESS + Reality :443" came back as two lines. Raised past the longest explicit
  // line in the corpus (~270px), so a break in the picture is a break in the source.
  flowchart: { htmlLabels: false, useMaxWidth: false, wrappingWidth: 400 },
  sequence: { useMaxWidth: false, wrap: true },
  er: { useMaxWidth: false },
  gantt: { useMaxWidth: false },
  class: { useMaxWidth: false },
  state: { useMaxWidth: false },
  journey: { useMaxWidth: false },
  pie: { useMaxWidth: false },
  themeVariables: {
    fontFamily: FONT_STACK,
    fontSize: '15px',
    background: PAGE,
    // Nodes take the surface token — the same tint as inline code and the figure plate.
    primaryColor: PLATE,
    primaryTextColor: INK,
    primaryBorderColor: BORDER,
    secondaryColor: WASH,
    secondaryTextColor: INK,
    secondaryBorderColor: BORDER,
    // Clusters sit on the page ground behind a hairline, so a subgraph reads as a frame
    // around its nodes rather than a second filled box behind them.
    tertiaryColor: PAGE,
    tertiaryTextColor: INK,
    tertiaryBorderColor: HAIRLINE,
    mainBkg: PLATE,
    nodeBorder: BORDER,
    clusterBkg: PAGE,
    clusterBorder: HAIRLINE,
    titleColor: INK,
    textColor: INK,
    lineColor: RULE,
    edgeLabelBackground: PAGE,
    nodeTextColor: INK,
    /* Sequence. */
    actorBkg: PLATE,
    actorBorder: BORDER,
    actorTextColor: INK,
    actorLineColor: RULE,
    signalColor: INK,
    signalTextColor: INK,
    labelBoxBkgColor: PLATE,
    labelBoxBorderColor: BORDER,
    labelTextColor: INK,
    loopTextColor: INK,
    altBackground: WASH,
    activationBkgColor: WASH,
    activationBorderColor: BORDER,
    sequenceNumberColor: PAGE,
    // A note is an aside, so it borrows the accent the way a blockquote's bar does.
    noteBkgColor: ACCENT_WASH,
    noteTextColor: INK,
    noteBorderColor: ACCENT,
  },
};

/**
 * Rules appended to each baked SVG's own style block, scoped to that diagram's id.
 *
 * With SVG text labels mermaid paints the rect behind an edge label at opacity 0.5, so the
 * edge line shows straight through the words — visible on the flowchart, where a three-line
 * label sits on top of the arrow between two subgraphs. The HTML-label path gets an opaque
 * box; this gives the SVG path the same one. Part of the cache key, so editing this line
 * re-bakes every diagram.
 */
export const DIAGRAM_CSS = ['.edgeLabel rect{opacity:1;}'];

/**
 * Make one rendered SVG fit to be *inlined into HTML*, which is not the same document type
 * mermaid serialised it for, and append the rules above.
 *
 * The bug this fixes is silent. Mermaid serialises as XML, so a child combinator inside its
 * stylesheet comes out escaped: `.noteText&gt;tspan`. Re-parsed by an HTML parser, a <style>
 * element's content is raw text — nothing decodes the entity, the selector is invalid, and
 * because one bad selector voids the whole comma-separated group it takes `.noteText` down
 * with it. Five rules per sequence diagram, covering note, loop, label and actor text. They
 * happen to be black on black here, so it cost nothing this time; it would not stay that way.
 */
export function finishDiagram(svg, id) {
  const rules = DIAGRAM_CSS.map((rule) => `#${id} ${rule}`).join('');
  if (!svg.includes('</style>')) return svg.replace(/^(<svg[^>]*>)/, `$1<style>${rules}</style>`);
  let appended = false;
  // Every style block is decoded, not just the first: today mermaid emits one per diagram,
  // and a version that emits two would otherwise leave the second one's selectors broken.
  return svg.replace(/(<style>)([\s\S]*?)(<\/style>)/g, (_all, open, css, close) => {
    const decoded = css.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    // A decoded `</style` would end the element early and spill CSS into the page as text.
    if (/<\/style/i.test(decoded)) throw new Error('diagram stylesheet contains a closing style tag');
    const tail = appended ? '' : rules;
    appended = true;
    return `${open}${decoded}${tail}${close}`;
  });
}

/**
 * Both ends have to hash the same bytes. The highlight plugin in @astrojs/markdown-satteri
 * strips one trailing newline from a fence's text; this strips every trailing newline and
 * normalises CRLF, so a checkout with other line endings still finds its cached diagram.
 */
// `(?<!\n)` anchors the match at the start of a newline run, so a long run in the middle of
// a fence is not rescanned from every position (80,000 newlines took 3.7 s without it).
export const normalizeDiagram = (source) => String(source).replace(/\r\n?/g, '\n').replace(/(?<!\n)\n+$/, '');

/** 16 hex characters = 64 bits. A collision needs billions of diagrams; the corpus has 3. */
export function diagramKey(source) {
  const material = JSON.stringify({
    v: DIAGRAM_SCHEMA,
    mermaid: MERMAID_VERSION,
    config: MERMAID_CONFIG,
    css: DIAGRAM_CSS,
    fonts: DIAGRAM_FONTS,
    source: normalizeDiagram(source),
  });
  return createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 16);
}

export const diagramFile = (key) => `${DIAGRAM_DIR}/${key}.svg`;

/**
 * The markup for the nth appearance of one diagram on a page (n from 0). Every id in a baked
 * file, the root's and the arrowhead markers', and every selector in its <style>, starts
 * from `mmd-<key>`, so one replacement keeps a second copy from sharing ids with the first.
 * It rewrites the <style> too, which is why astro.config.mjs hashes each copy for the
 * Content-Security-Policy through this same function rather than reading the file alone.
 */
export const diagramCopy = (svg, key, n) => (n === 0 ? svg : svg.replaceAll(`mmd-${key}`, `mmd-${key}-${n}`));

/**
 * The baked SVG, or null when this fence has not been rendered yet. Synchronous by design:
 * the plugin that calls it is a cache lookup, with no browser and no lifecycle to manage.
 */
export function readDiagram(key) {
  try {
    return readFileSync(diagramFile(key), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Every mermaid fence in a markdown document, in source order.
 *
 * A line-by-line CommonMark scan rather than one regex: a fence body can contain anything,
 * including shorter backtick runs, and a regex that matched the first closing run it saw
 * would end a mermaid block on a nested one. Tildes, indented openers (up to three spaces)
 * and longer closing runs are all part of the format, so they are all handled.
 */
export function findMermaidFences(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) {
      // A closing fence is the same character, at least as long, and carries nothing else.
      if (fence && fence[2][0] === open.char && fence[2].length >= open.length && fence[3].trim() === '') {
        if (open.mermaid) out.push({ source: open.body.join('\n'), line: open.line });
        open = null;
        continue;
      }
      // The opener's indent comes off every body line, as CommonMark requires.
      if (open.mermaid) open.body.push(line.replace(new RegExp(`^ {0,${open.indent}}`), ''));
      continue;
    }
    if (!fence) continue;
    const info = fence[3].trim();
    // A backtick fence cannot carry a backtick in its info string.
    if (fence[2][0] === '`' && info.includes('`')) continue;
    open = {
      char: fence[2][0],
      length: fence[2].length,
      indent: fence[1].length,
      mermaid: info.split(/\s+/)[0].toLowerCase() === 'mermaid',
      line: i + 1,
      body: [],
    };
  }
  // An unclosed fence still runs to the end of the document.
  if (open?.mermaid) out.push({ source: open.body.join('\n'), line: open.line });
  return out;
}
