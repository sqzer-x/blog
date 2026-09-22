/**
 * satteri-korean — two CommonMark inline rules that misfire on Korean prose.
 *
 * Both are the same kind of bug: a rule written for English, applied to a script whose
 * word boundaries and punctuation habits are different, producing markup the author never
 * asked for. Both were live on the built site, not hypothetical. Neither is fixable with a
 * parser flag — Sätteri's `gfm` option exposes footnotes and nothing else — so they are
 * repaired on the mdast, from the source text, before anything renders.
 *
 * ── 1. A single `~` is a range, not a deletion ───────────────────────────────────────
 * GFM strikethrough pairs single tildes as well as double ones, and Korean writes ranges
 * with a tilde constantly: `그림 3~4`, `5~8`, `25~50바이트`, `1Gbps ~ 100Gbps`. Two on one
 * line are a matched pair, so everything between them is struck through. Measured in
 * dist/ before this plugin — content/writing/how-to-win-best-paper-ko.md:231 shipped as
 *
 *     그림 3<del>4는 … 그림 5</del>8에는 결과와 분석이 담겨 있을 수 잇다.
 *
 * one sentence of the author's prose crossed out because it named two figure ranges.
 *
 * The rule installed here is: **`~~` strikes through, `~` is a literal tilde.** That is the
 * rule an author already carries — `~~` is what GitHub's own documentation shows and what
 * anyone reaching for strikethrough types — and it is decided on the source text, not
 * guessed from the content: the delimiter run is read straight out of ctx.source, so a
 * range and a deletion are told apart by what was written rather than by what it looks
 * like.
 *
 * ── 2. Emphasis that closes on a quote mark ──────────────────────────────────────────
 * CommonMark closes `**…**` only on a right-flanking delimiter run, and a run preceded by
 * punctuation is right-flanking only if what FOLLOWS it is whitespace or punctuation. In
 * English that rule earns its keep (it is what stops `a**b**c` from bolding mid-word). In
 * Korean it fires constantly, because a quoted phrase is followed immediately by a
 * particle with no space: `**‘직관적으로 옳다’**고`, `**TSO (TCP Segmentation Offload)**와`.
 * The closing run is preceded by `’`, followed by `고` — a letter, so not right-flanking —
 * so it cannot close, and the asterisks ship as literal text in the middle of the prose.
 *
 * Measured across the built site before this plugin: **12 runs in 3 posts**, and every one
 * of them had the identical shape — content ending in Unicode punctuation (Pe or Pf, a
 * closing bracket or a closing quote) with a CJK letter (Lo) immediately after the closing
 * run. That is not a coincidence, it is the flanking rule's blind spot, and it is what the
 * `cjk-friendly` CommonMark proposals exist to close upstream.
 *
 * So the repair is written as that exact shape rather than as a general "re-emphasise
 * stray asterisks" pass. It fires only where a CJK letter sits against the delimiter, i.e.
 * only where the flanking rule was answering a question about a script it does not model.
 * On the same corpus the one other literal-asterisk pair — bind9's `* port *`, whitespace
 * on both sides of the content — is left alone, which is CommonMark being right.
 *
 * Known limits, stated rather than hidden. Both are cases where the pair never reaches this
 * plugin intact, and both need a parser, not a visitor:
 *   - The repair reads one text node, so it cannot rejoin a run containing other inline
 *     markup: `**‘가’ [링크](x)**고` is three nodes and stays literal.
 *   - Two such runs on ONE line can be mispaired by the parser before anything gets here.
 *     Measured on `앞**‘강조’**뒤 그리고 앞**‘강조’** 뒤.`: the first `**` cannot open and the
 *     second can, so the parser bolds from the second to the third and leaves the outer two
 *     asterisks stranded. One run on a line — which is all 12 of the live ones, and the
 *     normal way anyone writes — leaves the whole pair literal, and that is repaired.
 */

/**
 * CJK letters, for the flanking question only: Hangul jamo and syllables, CJK ideographs
 * and their extensions, kana, and the halfwidth/fullwidth forms. This is deliberately
 * wider than the Hangul-only class in src/lib/hangul.ts — that one measures how Korean a
 * document is, this one asks whether a character is the kind of letter CommonMark's
 * flanking rule was not written for, and Japanese and Chinese have the same problem.
 */
const CJK = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-힣ힰ-퟿豈-﫿︰-﹏＀-｠￠-￦]/;

/** Unicode punctuation — the character class that broke the flanking test. */
const PUNCT = /\p{P}/u;

/**
 * A `*` or `**` pair with no whitespace just inside either delimiter and no `*` in the
 * content. Those two constraints are CommonMark's own (a run cannot open on trailing
 * whitespace or close on leading whitespace); repeating them here is what keeps the pass
 * from touching `2 * 3 * 4` or bind9's `* port *`.
 */
const PAIR = /(\*\*|\*)(?![\s*])([^*]*[^\s*])\1/g;

export default function satteriKorean() {
  return {
    name: 'korean',
    // Read by the `delete` visitor only; the emphasis repair works off the node's own text.
    options: { position: true },

    delete(node, ctx) {
      const at = node.position;
      // Defensive: a `delete` built by another plugin carries no position, and a node whose
      // delimiter cannot be read is left exactly as the parser made it.
      if (!at) return;
      if (ctx.source[at.start.offset + 1] === '~') return;   // ~~ … ~~ — a real deletion

      /*
       * Unwrap in place: the node's own children are handed back as replacement content,
       * between the two literal tildes that were the delimiters. Passing the existing
       * children rather than copies is what keeps inner markup intact — `~a **b** `c`~`
       * comes back as `~a <strong>b</strong> <code>c</code>~`, which a deep copy could not
       * do, because a child's own children resolve lazily and are not present to copy.
       *
       * Not `{ raw: … }`: a raw string is re-parsed as a document of its own, and measured,
       * that splices a block-level <p> into the middle of the paragraph.
       */
      ctx.replaceNode(node, [
        { type: 'text', value: '~' },
        ...node.children,
        { type: 'text', value: '~' },
      ]);
    },

    text(node, ctx) {
      const src = node.value;
      if (!src.includes('*')) return;

      const out = [];
      let cut = 0;
      PAIR.lastIndex = 0;
      for (let m = PAIR.exec(src); m; m = PAIR.exec(src)) {
        const [whole, run, content] = m;
        const before = src[m.index - 1] ?? '';
        const after = src[m.index + whole.length] ?? '';

        /*
         * Only the two shapes the flanking rule gets wrong, one per side:
         *   closing  …옳다’**고   content ends in punctuation, a CJK letter follows
         *   opening  앞**‘강조’…   content starts with punctuation, a CJK letter precedes
         * Anything else that survived as literal asterisks survived on purpose.
         */
        const closingCase = PUNCT.test(content.at(-1)) && CJK.test(after);
        const openingCase = PUNCT.test(content[0]) && CJK.test(before);
        if (!closingCase && !openingCase) continue;

        if (m.index > cut) out.push({ type: 'text', value: src.slice(cut, m.index) });
        out.push({
          type: run === '**' ? 'strong' : 'emphasis',
          children: [{ type: 'text', value: content }],
        });
        cut = m.index + whole.length;
      }

      if (!out.length) return;
      if (cut < src.length) out.push({ type: 'text', value: src.slice(cut) });
      ctx.replaceNode(node, out);
    },
  };
}
