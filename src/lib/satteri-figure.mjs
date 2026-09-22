/**
 * satteri-figure — promotes the corpus's own caption convention to real markup.
 *
 * The author already writes captions as an italic paragraph directly beneath a standalone
 * image; 11 of the 22 standalone images in the corpus carry one (arp-spoofing 8, doh 2,
 * bind9 1). Without this they render as ordinary italic paragraphs and every image ships
 * as a bare <img> with no <figure>.
 *
 * It also repairs alt text: 20 of 26 images have an alt that is empty or filename-shaped
 * ("image", "image-1", "img_4305", "2026-08-13-165932"), which a screen reader spells out
 * letter by letter. Junk alt is cleared, and where a caption exists it becomes the alt.
 *
 * The repair is not limited to the images this plugin lifts. The figure path only takes a
 * paragraph containing nothing BUT images, so an image with prose beside it, a linked
 * image [![](a)](b), or an image in a list or a table cell never reaches it -- and those
 * carry exactly the same "image-1" the corpus produces everywhere else. None of the 26
 * corpus images are in that position today, which is the only reason this has not been
 * audible; the `image` visitor below makes the repair total rather than positional.
 */

const JUNK_ALT =
  /^(?:images?|imgs?|photos?|screenshots?|figures?)?[-_ ]?\d*$|^\d{4}-\d{2}-\d{2}[-_\d]*$|^[a-z]+_\d+$/i;

const meaningful = (kids = []) =>
  kids.filter((k) => !(k.type === 'text' && k.value.trim() === ''));

/** The single meaningful child of a paragraph, or null. */
function sole(node) {
  if (!node || node.type !== 'paragraph') return null;
  const kids = meaningful(node.children);
  return kids.length === 1 ? kids[0] : null;
}

/**
 * Every image in a paragraph that holds nothing but images, or null.
 * 인지부조화이론.md places three portrait scans on three consecutive lines, which
 * CommonMark folds into one paragraph — they are a group, not three loose images.
 */
function imageOnly(node) {
  if (!node || node.type !== 'paragraph') return null;
  const kids = meaningful(node.children);
  return kids.length > 0 && kids.every((k) => k.type === 'image') ? kids : null;
}

function textOf(nodes) {
  let out = '';
  for (const n of nodes ?? []) out += n.value ?? textOf(n.children);
  return out.trim();
}

export default function satteriFigure() {
  return {
    name: 'figure',
    /*
     * Runs after `before` has built the figures, so every image it sees is one the figure
     * path did not claim -- plus the plates' own images, whose alt is already either a
     * caption or empty, and clearing an empty alt again is a no-op. An alt is only ever
     * cleared, never invented: a filename is worse than silence to a screen reader, and
     * this plugin has no way to know what the picture shows.
     */
    image(node, ctx) {
      const alt = node.alt ?? '';
      if (alt !== '' && JUNK_ALT.test(alt)) ctx.setProperty(node, 'alt', '');
    },
    before(root, ctx) {
      const kids = root.children ?? [];
      for (let i = 0; i < kids.length; i++) {
        const images = imageOnly(kids[i]);
        if (!images) continue;

        const next = sole(kids[i + 1]);
        const caption = next && next.type === 'emphasis' ? next.children : null;

        const plate = images.map((image, n) => {
          const alt = JUNK_ALT.test(image.alt ?? '') ? '' : (image.alt ?? '');
          // With a caption present the alt stays empty: the figcaption is real text in the
          // DOM and is announced, so repeating it in alt only makes it read twice.
          return { type: 'image', url: image.url, title: image.title ?? null, alt: caption ? '' : alt };
        });

        const body = [{
          type: 'paragraph',
          data: { hName: 'span', hProperties: { className: ['fig__plate'] } },
          children: plate,
        }];
        if (caption) body.push({ type: 'paragraph', data: { hName: 'figcaption' }, children: [...caption] });

        ctx.replaceNode(kids[i], {
          type: 'figure',
          data: { hName: 'figure', hProperties: { className: ['fig'], 'data-count': String(plate.length) } },
          children: body,
        });
        if (caption) { ctx.removeNode(kids[i + 1]); i++; }
      }
    },
  };
}
