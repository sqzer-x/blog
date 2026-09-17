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

const about = defineCollection({
  loader: glob({ base: './content', pattern: 'about.md', generateId: () => 'about' }),
  schema: z.object({ title: z.string(), date: dateString.optional() }),
});

export const collections = { writing, about };
