/**
 * satteri-guard — the markup a post may carry, enforced when it renders.
 *
 * Sätteri emits raw HTML verbatim and sanitises nothing, with rawHtml on or off, and
 * `headingAttributes` copies every key=value in `## Title {…}` onto the heading. Without
 * this a post could ship a <script>, an onmouseover on a heading or a javascript: link on
 * a green build. This is a security blog: quoting a payload is ordinary writing here, and
 * one missed pair of backticks turns a quotation into markup.
 *
 * Every rule throws. The glob loader logs the message against the file, and the page's
 * render guard (src/lib/rendered.ts) then fails the build, so nothing ships.
 *
 *   raw HTML   only the inline elements Markdown has no syntax for and the article
 *              stylesheet styles — kbd, mark, abbr with a title, sub, sup, ins — plus br
 *              for a line break inside a table cell. No other attribute, no comment.
 *   headings   id and class, which is what `{#id .class}` is for.
 *   links      http, https, mailto, or a path on this site.
 *   images     this site only. A remote image hands every reader's address to its host,
 *              and the Content-Security-Policy would block it anyway.
 *
 * It must run first among the hast plugins: satteriDiagram inlines its SVG as a raw node,
 * and that one is ours.
 */
const SITE = new URL('https://blog.sqzer.com/');
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/* The allowed tags, removed in one pass. Whatever is left must not open markup the way the
   HTML tokenizer defines it: `<` followed by a letter, `/`, `!` or `?`. A `<` before a
   space or a digit is text to a browser, so "a < b" and "<3" stay legal.
   Whitespace is the tokenizer's set, not JavaScript's \s, which would also take a
   no-break space the browser reads as part of a name. A quoted title may hold `>`, which
   is text inside quotes to both CommonMark and the browser, but not `<`: that keeps a match
   from reaching into another tag, so every `<` is an allowed tag or is left to be caught. */
const WS = '[\\t\\n\\f\\r ]';
const ALLOWED_TAG = new RegExp(
  `<\\/?(?:kbd|mark|sub|sup|ins)${WS}*>|<\\/abbr${WS}*>` +
    `|<abbr${WS}+title${WS}*=${WS}*(?:"[^"<]*"|'[^'<]*')${WS}*>|<br${WS}*\\/?>`,
  'gi',
);
const OPENS_MARKUP = /<[A-Za-z!?/]/;

/* Sätteri percent-encodes [ and ] anywhere in a link destination, so http://[::1]:8080/
   arrives as http://%5B::1%5D:8080/, which neither the URL parser nor a browser accepts.
   The brackets are put back in the authority of an http(s) or protocol-relative link only,
   and that repaired address is what ships. */
const IPV6_HOST = /^((?:https?:)?\/\/(?:[^/?#@[\]]*@)?)%5B([0-9A-Fa-f:.]+)%5D(?=[:/?#]|$)/i;

const clip = (s) => (s.length > 80 ? `${s.slice(0, 77)}...` : s);
const resolve = (value) => {
  try { return new URL(String(value), SITE); } catch { return null; }
};

const commentError = (text) =>
  new Error(
    `satteri-guard: HTML comment ${JSON.stringify(clip(text))} would be published in the ` +
      'page source, and the repository is public as well. Delete it. If it was separating ' +
      'two lists, start the second with a different marker instead ("-" then "*", or "1." ' +
      'then "1)"): deleting the comment alone merges them into one list.',
  );

export default function satteriGuard() {
  return {
    name: 'guard',
    raw(node) {
      const html = node.value.trim();
      // With rawHtml off a comment arrives as raw text like any other markup.
      if (html.startsWith('<!--')) throw commentError(html);
      if (OPENS_MARKUP.test(html.replace(ALLOWED_TAG, '')))
        throw new Error(
          `satteri-guard: raw HTML ${JSON.stringify(clip(html))} is not allowed. ` +
            'A literal < in prose takes a backslash (\\<Inception>, List\\<String>). Code, ' +
            'commands, placeholders and quoted markup go in backticks or a code fence, and a ' +
            'key goes in <kbd>. Only <kbd>, <mark>, <abbr title>, <sub>, <sup>, <ins> and ' +
            '<br> may be written as HTML.',
        );
    },
    comment(node) {
      throw commentError(`<!--${node.value}-->`);
    },
    element: [
      {
        filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        visit(node, ctx) {
          const extra = Object.keys(node.properties ?? {}).filter((k) => k !== 'id' && k !== 'className');
          if (extra.length)
            throw new Error(
              `satteri-guard: heading ${JSON.stringify(clip(ctx.textContent(node)))} carries ` +
                `${extra.join(', ')}. A {…} at the end of a heading is read as attributes, and ` +
                'may only set #id and .class. If the braces are text, escape the closing one ' +
                '({a,b,c\\}), put them in backticks, or end the line with " ##". Escaping ' +
                'only the opening one (\\{) does not work.',
            );
        },
      },
      {
        filter: ['a'],
        visit(node, ctx) {
          if (node.properties?.href == null) return;
          const href = String(node.properties.href);
          const repaired = href.replace(IPV6_HOST, '$1[$2]');
          const url = resolve(repaired);
          if (!url)
            throw new Error(
              `satteri-guard: link to ${JSON.stringify(clip(href))} could not be parsed as a URL. ` +
                'Check the host and the port.',
            );
          if (!LINK_PROTOCOLS.has(url.protocol))
            throw new Error(
              `satteri-guard: link to ${JSON.stringify(clip(href))} is not allowed. ` +
                'Links may be http, https, mailto or a path on this site.',
            );
          if (repaired !== href) ctx.setProperty(node, 'href', repaired);
        },
      },
      {
        filter: ['img'],
        visit(node) {
          const src = node.properties?.src;
          const url = src == null ? null : resolve(src);
          if (!url || url.origin !== SITE.origin)
            throw new Error(
              `satteri-guard: image ${JSON.stringify(clip(String(src)))} is not on this site. ` +
                'Put it in public/uploads/ and link it as /uploads/….',
            );
        },
      },
    ],
  };
}
