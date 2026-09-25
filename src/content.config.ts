import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Lowercase ASCII only, leaving Korean and Cyrillic untouched. */
export const asciiLower = (s: string): string =>
  s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

/**
 * YAML parses `2025-12-07` into a Date at midnight UTC. It must be read back in UTC: read
 * in local time west of UTC, every date falls back a day, which would also move any post
 * dated January 1 into the previous year's URL.
 */
const dateString = z.union([z.string(), z.date()]).transform((v) =>
  typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10),
);

/**
 * YAML reads a key with nothing after it — `deck:` — as null, and null satisfies neither
 * `.optional()`, which admits undefined and not null, nor `.default([])`, which fires on
 * undefined only. Left alone, every optional field rejects the blank line while accepting
 * the key being absent altogether, which is exactly backwards for a site whose posts are
 * copied from a template of blanks.
 *
 * So each optional field is wrapped here, and both spellings of "nothing" — bare null and
 * the quoted empty string `deck: ""` — are absorbed to undefined before the field's own
 * schema sees the value. The field schema is still the one that runs, so `type: novel` and
 * `tags: security` are rejected as loudly as before; only emptiness is reinterpreted.
 *
 * This is what content/_template.md stands on: a line the author leaves blank parses to
 * undefined, and undefined is what every page already tests for before it prints anything.
 */
const blankable = <T extends z.ZodType>(field: T) =>
  z.preprocess((v) => (v === null || v === '' ? undefined : v), field);

/** Optional free text. Absent, `deck:` and `deck: ""` all arrive as undefined. */
const optText = blankable(z.string().optional());

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
    /**
     * Published as data-type on the /writing/ entry, which is what a later split into
     * sub-views would key on rather than a URL segment. Untyped is the norm.
     */
    type: blankable(z.enum(['essay', 'research']).optional()),
    /** A blank `tags:` and `tags: []` mean the same thing, and neither prints a tag list. */
    tags: blankable(z.array(z.string()).default([])),
    /** Blank publishes. Only an explicit `draft: true` withholds a post. */
    draft: blankable(z.boolean().optional()),
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
    /** Blankable for the same reason the writing fields are: `draft:` is null, not false. */
    draft: blankable(z.boolean().optional()),
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
