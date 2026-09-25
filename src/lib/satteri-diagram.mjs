/**
 * satteri-diagram — swaps a mermaid fence for the SVG that was baked from it.
 *
 * This is a cache lookup and nothing else. `mermaid` is in syntaxHighlight.excludeLangs, so
 * the highlight plugin returns before Shiki ever sees the block and the original
 * <pre><code class="language-mermaid"> arrives here intact; the picture itself was drawn
 * once, in a browser, by scripts/render-diagrams.mjs, and committed under a hash of its
 * source. No browser, no async, no mermaid import, and nothing at all for the reader to
 * download.
 *
 * The output is one <figure class="diagram"> holding the SVG. It is focusable but not a
 * scroll region: base.css scales the picture into the column, and the baked SVG keeps the
 * width/height attributes that give it a ratio to scale by (see the useMaxWidth note in
 * diagrams.mjs). What the tabindex buys is a keyboard reader landing on the figure - the
 * drawing is vector, so a reader who lands on it can zoom it losslessly.
 */
import { diagramCopy, diagramFile, diagramKey, normalizeDiagram, readDiagram } from './diagrams.mjs';

/**
 * A build with a fence that was never rendered is a broken build, not a warning: the
 * prebuild step renders every fence its scan finds, so a miss here means it did not run or
 * did not see that fence.
 * `astro dev` skips prebuild, though, and an author who has just typed a new diagram wants
 * to keep typing — so the dev server shows the source with a note instead of dying.
 */
const DEV = process.env.NODE_ENV !== 'production';

/** mermaid's own word for what it drew, from aria-roledescription, turned into a label. */
const LABELS = {
  'flowchart-v2': 'Flowchart',
  flowchart: 'Flowchart',
  sequence: 'Sequence diagram',
  class: 'Class diagram',
  state: 'State diagram',
  er: 'Entity relationship diagram',
  gantt: 'Gantt chart',
  journey: 'User journey',
  pie: 'Pie chart',
  mindmap: 'Mind map',
  timeline: 'Timeline',
  quadrantChart: 'Quadrant chart',
  gitGraph: 'Git graph',
};

export default function satteriDiagram() {
  return {
    name: 'diagram',
    before(root, ctx) {
      // Per document: the id inside a baked SVG is its hash, so the same diagram twice on
      // one page would be the same id twice. Only the repeats are renamed.
      ctx.data.diagramSeen = new Map();
    },
    element: {
      filter: ['pre'],
      visit(node, ctx) {
        const code = node.children?.find((c) => c.type === 'element' && c.tagName === 'code');
        if (!code || code.type !== 'element') return;
        // data.lang is what the highlight plugin keys on, so it is the same contract; the
        // class is the fallback for a tree that arrived some other way.
        const lang = code.data?.lang
          ?? (Array.isArray(code.properties?.className)
            ? String(code.properties.className.find((c) => String(c).startsWith('language-')) ?? '').slice(9)
            : '');
        if (lang !== 'mermaid') return;

        const source = normalizeDiagram(ctx.textContent(code));
        const key = diagramKey(source);
        const svg = readDiagram(key);

        if (!svg) {
          const message =
            `No baked diagram for this mermaid fence (${diagramFile(key)}). Run: npm run diagrams`;
          // Measured, not assumed: Astro's glob loader catches a render error, logs it and
          // stores the entry with no body, and `process.exitCode = 1` here does not survive
          // the CLI. What turns this throw into a failed build is the page's render guard
          // (src/lib/rendered.ts). The first gate is `npm run prebuild`, which exits 1 when
          // a fence its scan finds has no SVG and no browser to make one, and npm then never
          // reaches `astro build`. That is why the workflow calls `npm run build`. A fence
          // the scan does not see, such as one inside a blockquote, reaches this throw.
          if (!DEV) throw new Error(`satteri-diagram: ${message}`);
          return {
            type: 'element',
            tagName: 'figure',
            properties: { className: ['diagram', 'diagram--unbaked'] },
            children: [
              { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: message }] },
              node,
            ],
          };
        }

        const seen = ctx.data.diagramSeen;
        const repeat = seen.get(key) ?? 0;
        seen.set(key, repeat + 1);
        const markup = diagramCopy(svg, key, repeat);

        const kind = /aria-roledescription="([^"]+)"/.exec(svg)?.[1] ?? '';
        const label = LABELS[kind] ?? 'Diagram';

        return {
          type: 'element',
          tagName: 'figure',
          properties: {
            className: ['diagram'],
            'data-diagram': kind || 'diagram',
            // Not for scrolling - see the header. A labelled group a reader can reach, and
            // stop on, before zooming into the one thing on the page that rewards it.
            // A group, not a region: every region is a landmark, and a post with two
            // sequence diagrams would list two landmarks with the same name.
            tabindex: '0',
            role: 'group',
            'aria-label': label,
          },
          children: [{ type: 'raw', value: markup.trim() }],
        };
      },
    },
  };
}
