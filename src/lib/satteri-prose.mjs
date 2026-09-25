/**
 * satteri-prose — three repairs to the rendered tree, in one plugin.
 *
 * 1. Demote headings. 8 of 30 posts use `#` as a section heading (VTZero 4,
 *    인지부조화이론 5, how-to-win-best-paper-ko 4, AIOdyssey 2, We_need_to_talk 2,
 *    journalctl 1, sysmon 1, tso 1), each of which would emit an <h1> competing with the
 *    article title. When a document contains any h1, every heading drops one level.
 *    This runs before Sätteri's heading-id plugin, so `headings` from render() reports the
 *    shifted depths and the table of contents stays truthful.
 *    Unless the document also contains an h6, which is where +1 stops being a shift and
 *    starts being a collision: h6 is the floor, so h5 would land on top of it and the
 *    document would lose a level it was using. --fs-h5 and --fs-h6 are different sizes, so
 *    that is visible, not just semantic. No corpus post has an h6 today, so this guard has
 *    never fired; it is here because the premise of the contents rail is that every post
 *    grows headings, and a post deep enough to reach h6 is exactly the one that would.
 * 2. Stamp intrinsic image size. The 26 images live in public/uploads and so bypass
 *    Astro's image service: no width/height, and every one shifts layout while loading.
 *    With the attributes present and no CSS `width`, the 13 images narrower than the 728px
 *    column render at their own size instead of being upscaled.
 * 3. Wrap tables. 4 posts contain tables; each gets a focusable scroll container so a wide
 *    table never makes the page itself scroll sideways.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** PNG / WebP / JPEG intrinsic size straight from the file header — no dependency. */
function intrinsicSize(file) {
  let b;
  try { b = readFileSync(file); } catch { return null; }
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47)
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const tag = b.toString('latin1', 12, 16);
    if (tag === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    if (tag === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (tag === 'VP8L') { const n = b.readUInt32LE(21);
      return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { height: b.readUInt16BE(o + 5), width: b.readUInt16BE(o + 7) };
      o += 2 + b.readUInt16BE(o + 2);
    }
  }
  return null;
}

const sizes = new Map();

/**
 * The two answers the heading demotion below needs — is there an h1 to get out of the
 * title's way, and is there an h6 already at the floor that a shift would collide with —
 * found by visiting only those two tags, which Sätteri filters natively.
 *
 * This used to be a `before` hook walking the whole tree in JavaScript, which materialised
 * every node: every Shiki token span and every SVG element included. Measured, a 9 KB wide
 * table took 13.9 s that way, an 18 KB one ran out of Map space after 83 s, and a 12 KB
 * nested list overflowed the stack; either failure shipped the post empty. The output is
 * byte-identical.
 *
 * It is a plugin of its own and must come BEFORE satteriProse in hastPlugins: one plugin's
 * visitors all run before the next plugin starts, so the flags are set before the
 * demotion reads them. Placed after, the demotion would silently never happen.
 */
export function satteriHeadingScan() {
  return {
    name: 'heading-scan',
    element: {
      filter: ['h1', 'h6'],
      visit(node, ctx) {
        if (node.tagName === 'h1') ctx.data.proseHasH1 = true;
        else ctx.data.proseHasH6 = true;
      },
    },
  };
}

export default function satteriProse({ publicDir = 'public' } = {}) {
  return {
    name: 'prose',
    element: [
      {
        filter: ['h1', 'h2', 'h3', 'h4', 'h5'],
        visit(node, ctx) {
          if (!ctx.data.proseHasH1 || ctx.data.proseHasH6) return;
          return { ...node, tagName: `h${Number(node.tagName[1]) + 1}` };
        },
      },
      {
        filter: ['img'],
        visit(node, ctx) {
          const src = String(node.properties?.src ?? '');
          if (src.startsWith('/') && node.properties?.width == null) {
            const file = path.join(publicDir, decodeURIComponent(src));
            if (!sizes.has(file)) sizes.set(file, intrinsicSize(file));
            const s = sizes.get(file);
            if (s) { ctx.setProperty(node, 'width', s.width); ctx.setProperty(node, 'height', s.height); }
          }
          if (node.properties?.loading == null) ctx.setProperty(node, 'loading', 'lazy');
          if (node.properties?.decoding == null) ctx.setProperty(node, 'decoding', 'async');
        },
      },
      {
        filter: ['table'],
        visit(node, ctx) {
          const parent = ctx.parent(node);
          if (parent?.type === 'element' && parent.tagName === 'div') return;
          ctx.wrapNode(node, {
            type: 'element', tagName: 'div',
            // A group, as the code plates are: a region is a landmark, and the Hitchhiker post
            // listed three landmarks all named "Table".
            properties: { className: ['scroller'], tabindex: '0', role: 'group', 'aria-label': 'Table' },
            children: [],
          });
        },
      },
    ],
  };
}
