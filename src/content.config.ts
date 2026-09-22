import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Lowercase ASCII only, leaving Korean and Cyrillic untouched. */
export const asciiLower = (s: string): string =>
  s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

/**
 * YAML parses `2025-12-07` into a Date. It must be read back in UTC: reading it in local
 * time shifts roughly half the corpus by a day, which would also move every post URL.
 */
const dateString = z.union([z.string(), z.date()]).transform((v) =>
  typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10),
);

/** An empty `deck:` parses as null, which fails validation unless absorbed to undefined. */
const optText = z.preprocess(
  (v) => (v === null || v === '' ? undefined : v),
  z.string().optional(),
);

const slugOf = ({ entry }: { entry: string }) =>
  asciiLower(entry.replace(/^.*\//, '').replace(/\.md$/, ''));

const writing = defineCollection({
  loader: glob({ base: './content/writing', pattern: '*.md', generateId: slugOf }),
  schema: z.object({
    title: z.string(),
    /** Keeps the original Korean title when a post switches to an English one. */
    titleKo: optText,
    date: dateString,
    /** In an index without images the deck carries the entry. May be empty until backfilled. */
    deck: optText,
    /** Sub-views split on this value rather than on a URL segment. */
    type: z.enum(['essay', 'research']).optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().optional(),
  }),
});

/**
 * A project link. Either an absolute http(s) URL or a root-relative path on this site:
 * the reference's own code page points some entries at GitHub and others at a page it
 * hosts itself, so both shapes stay open.
 *
 * This is the one field on the page whose defect a schema can actually catch. `new URL()`
 * rejects `htps://…`, a missing slash after the scheme and a host with no dot; what it
 * cannot see is a well-formed URL pointing at the wrong repository, so the check is a
 * floor, not a guarantee. Internal paths are required to end in a slash because
 * astro.config.mjs builds with `trailingSlash: 'always'` — without one the link takes a
 * redirect, or 404s on a host that does not add it.
 *
 * Written as a single `.refine()` with a boolean predicate rather than `superRefine` +
 * `ctx.addIssue`, whose issue shape differs between Zod majors; this form reads the same
 * whichever one `astro:content` re-exports.
 */
const isProjectUrl = (v: string): boolean => {
  if (v.startsWith('/')) return v.endsWith('/');
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
};

const projectUrl = z.string().refine(isProjectUrl, {
  message:
    'must be an absolute http(s) URL with a dotted hostname, or a path on this site ending in "/"',
});

/**
 * The Code index is a hand-ranked list, so it carries no date: `order` ascending is the
 * whole sort, and the author changes the page by changing one number in front matter.
 * Numbered in tens in content/code so a project can be slotted between two others
 * without renumbering the tail.
 *
 * Deliberately NOT derived from anything: sorting by date would put the list in an order
 * nobody chose, and sorting by stars would let GitHub reorder the page.
 */
const code = defineCollection({
  loader: glob({ base: './content/code', pattern: '*.md', generateId: slugOf }),
  schema: z.object({
    /**
     * The link text, and the project's own name rather than its repo slug — `UAF —
     * Ultimate AP Finder`, not `uaf`. The slug still comes from the filename, so the two
     * are free to differ.
     */
    name: z.string(),
    url: projectUrl,
    order: z.number().int(),
    draft: z.boolean().optional(),
  }),
  /*
   * No `description` field. The one-sentence description is the markdown BODY of each
   * file, which is what a markdown file is for: it needs no YAML quoting, so a colon or
   * an apostrophe in a sentence cannot break the parse, and an author who wants to put a
   * link or an emphasis inside the sentence later can.
   *
   * Also no `language` and no `licence`, though both were to hand. Three reasons, in
   * order of weight: the reference prints neither and this page is modelled on it; both
   * are one click away at the other end of the link that is already the entry's headline;
   * and a field this site cannot keep true should not be printed — `uaf` already
   * disagrees with itself, carrying no licence in its repository metadata and
   * `GPL-2.0-or-later` in its README. Stars are out for the same reason twice over: the
   * reference shows none, and a number that changes without a commit does not belong in
   * a git-based site's content.
   */
});

const about = defineCollection({
  loader: glob({ base: './content', pattern: 'about.md', generateId: () => 'about' }),
  schema: z.object({ title: z.string(), date: dateString.optional() }),
});

export const collections = { writing, code, about };
