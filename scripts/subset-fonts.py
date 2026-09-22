#!/usr/bin/env python3
"""Rebuild the shipped web fonts from the variable masters in fonts-src/.

fonts-src/ is deliberately outside public/: Astro copies public/ verbatim, so the
masters used to be published alongside the subsets - 294,772B of fonts in dist/fonts/
for a site that references two files totalling 140,436B.

Maintenance tool, not a build step: the outputs are committed to public/fonts/ and the
GitHub Actions build never runs this. Re-run it when the corpus gains characters the
subsets do not cover, then commit the new files and the hashes printed at the end.

    python -m pip install "fonttools[woff]" brotli
    python scripts/subset-fonts.py

Two faces, two scripts. Lora is the only Latin face on the site - body, headings, links,
nav and the wordmark all resolve to it - and Pretendard covers Hangul. Lora has no
Hangul and Pretendard's Latin is switched off by unicode-range, so the two never compete
for a codepoint.

Why each flag is here, measured on this repo's masters by removing one flag at a time
from the recipe below and re-encoding in a single session, so the pairs below compare
like with like:

  unicodes   The dominant saving on Lora, and the only large one. The master carries 778
             codepoints - 318 Latin Extended and Vietnamese, 242 Cyrillic, 20 combining
             marks, 6 Greek - against the 105 the whole built corpus paints. Cutting to
             LATIN takes 71,504 -> 22,288. On Pretendard the same idea drops the Latin the
             unicode-range gate had already made unreachable: 130,528 -> 118,212.

  instancer  Worth 49,552B on Pretendard, whose wght axis runs 45-930 against the 400-700
             the design uses, and whose gvar is 226,842B of the 466,492B sfnt. On Lora it
             is worth nothing: the axis already *is* 400-700, so there is no range to trim
             and the two encodings differ by 4B, which is inside woff2's own noise. The
             call stays because it is what pins the design's range in one readable place,
             not because it pays for itself on the Latin face.

  features   kern + liga, nothing else. GPOS also carries mark attachment and script
             shaping this site never invokes; dropping the rest takes Lora 23,268 ->
             22,288. On Pretendard it is now worth 28B, i.e. nothing: once the Latin is
             gone, Hangul has no other features left to drop. Kept for both so the recipe
             is one recipe.

             liga is the one the outgoing sans had no use for. Lora's f has a prominent
             hook that runs into the dot of a following i, and the built corpus renders 61
             `fi`, 52 `fl` and 17 `ffl` sequences. Lora's liga covers f+i and f+l and
             costs 396B over kern alone. Dropping it would save a third of a kilobyte by
             breaking 113 words.

Measured results (bytes), as shipped:
    lora-var.woff2          84,764 -> latin-9bba8f25.woff2    22,300   (-74%)
    pretendard-var.woff2   210,008 -> ko-02f8cebd.woff2      118,136   (-44%)
                                      english route           22,300
                                      korean route           140,436

woff2 encoding is not byte-deterministic. Re-running this on unchanged masters moves the
output by a hundred bytes or so - Pretendard has come out at 118,136, 118,212 and 118,276
from identical input - which is why every filename is content-hashed and why the figures
above are quoted to compare against each other, never as a checksum.

Not shipped, deliberately:

    Lora-Italic (wght 400-700, same recipe)   ~23,400   0 renders in the whole corpus.
        The corpus holds 25 markdown emphasis runs. satteri-figure.mjs lifts 15 of them
        out as figure captions, which are upright by design, and the 10 that survive as
        <em> are all on documents that resolve to lang="ko", where [slug].astro sets
        `.post[lang='ko'] .prose em { font-style: normal; font-weight: 500 }` because
        Pretendard has no italic. Nothing on the site requests font-style: italic, so
        nothing synthesises one either - this is 23KB that would never be fetched.
        If an English post ever uses emphasis, put Lora-Italic-wght back in fonts-src/ and
        add one JOBS row with font-style: italic in fonts.css; the recipe is unchanged.

    Three pinned weights instead of one axis   11,872 + 12,396 + 11,912 = 36,180, against
        22,288 for the axis. The design reaches 400 (body), 500 (headings, Korean
        emphasis) and 700 (links, kickers, nav, wordmark), and Lora's axis is exactly
        400-700, so all three are real instances. One variable file carrying all three is
        13,892B cheaper than three static ones and is one request instead of three.
"""
import hashlib, os, pathlib, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "fonts-src"          # variable masters, never published
OUT = ROOT / "public" / "fonts"    # the two files the site actually serves
TMP = ROOT / ".fonts-work"

# The five Hangul blocks, identical to the unicode-range in fonts.css.
KO = "U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7A3,U+D7B0-D7FF"

# Printable ASCII plus the ten non-ASCII marks the built corpus actually paints. This is
# the exact set, not an estimate: every .html in dist/ plus every .md in content/ was
# scanned, and the non-Hangul result is these 105 codepoints. The retired Inter and
# Newsreader masters had already been cut the same way, to 107 and 104, so nothing the
# site renders today is lost - and U+2022 and U+2248 are gained, because Newsreader
# carried no bullet and neither face carried an approximation sign.
#
# 27 further non-Hangul codepoints appear in the corpus and are in no shipped face:
# arrows, box drawing, circled digits, kana and emoji. They fall to a system font, which
# is what they do today as well. Adding them is not an option - Lora has none of them.
LATIN = "U+0020-007E,U+00B7,U+2013-2014,U+2018-2019,U+201C-201D,U+2022,U+2026,U+2248"

JOBS = [
    # master,                  stem,      axis limits,           unicodes
    ("lora-var.woff2",        "latin",   {"wght": (400, 700)},  LATIN),
    ("pretendard-var.woff2",  "ko",      {"wght": (400, 700)},  KO),
]


def build(master, stem, limits, unicodes):
    src = SRC / master
    if not src.exists():
        sys.exit(f"missing master: {src}")
    font = TTFont(src)
    font = instancer.instantiateVariableFont(
        font, limits, updateFontNames=False, optimize=True
    )
    TMP.mkdir(exist_ok=True)
    flat = TMP / f"_{stem}.ttf"
    font.flavor = None
    font.save(flat)

    out = TMP / f"{stem}.woff2"
    subset.main([
        str(flat),
        f"--output-file={out}",
        "--flavor=woff2",
        "--no-hinting",
        "--desubroutinize",
        "--layout-features=kern,liga",
        "--drop-tables+=DSIG",
        f"--unicodes={unicodes}",
    ])
    flat.unlink()

    digest = hashlib.sha256(out.read_bytes()).hexdigest()[:8]
    # public/ is copied verbatim by Vite, so nothing hashes these filenames for us.
    # GitHub Pages pins Cache-Control at max-age=600 and cannot be configured, which
    # makes the filename the only cache-invalidation handle we have.
    final = OUT / f"{stem}-{digest}.woff2"
    OUT.mkdir(parents=True, exist_ok=True)
    for stale in OUT.glob(f"{stem}-*.woff2"):
        if stale != final:
            stale.unlink()
    final.write_bytes(out.read_bytes())
    out.unlink()
    return final.name, final.stat().st_size


def rewrite(names):
    """Point fonts.css, Base.astro and tokens.css at the files that were just written.

    woff2 encoding is not byte-deterministic, so the digest moves on every run even when
    the input does not. Hand-syncing filenames across three files after each rebuild is a
    guaranteed source of a silent 404 and a page rendered entirely in fallback, so the
    script owns the references instead of documenting them.
    """
    import re
    targets = [
        ROOT / "src" / "styles" / "fonts.css",
        ROOT / "src" / "layouts" / "Base.astro",
        # tokens.css cites the shipped Latin file by its hashed name in the type-scale
        # derivation comment, so it goes stale on every rebuild exactly like the other
        # two. It carries no url(), only prose, so a stale name here is a misleading
        # citation rather than a 404 - but it is the same hand-sync this function exists
        # to remove.
        ROOT / "src" / "styles" / "tokens.css",
    ]
    for t in targets:
        text = t.read_text(encoding="utf-8")
        for stem, name in names.items():
            text = re.sub(rf"/fonts/{stem}-[0-9a-f]{{8}}\.woff2", f"/fonts/{name}", text)
        t.write_text(text, encoding="utf-8")
        print(f"  updated {t.relative_to(ROOT)}")


def main():
    print(f"{'file':<34}{'bytes':>9}")
    names, sizes = {}, {}
    for master, stem, limits, unicodes in JOBS:
        name, size = build(master, stem, limits, unicodes)
        names[stem], sizes[stem] = name, size
        print(f"{name:<34}{size:>9,}")
    print("-" * 43)
    print(f"{'latin only (english route)':<34}{sizes['latin']:>9,}")
    print(f"{'+ korean face (31 of 35 pages)':<34}{sizes['latin'] + sizes['ko']:>9,}")
    print()
    rewrite(names)


if __name__ == "__main__":
    main()
