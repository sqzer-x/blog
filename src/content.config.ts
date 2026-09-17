import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Hugo 규칙: URL 세그먼트는 **ASCII 만** 소문자화한다. 한글·키릴은 건드리지 않는다. */
export const asciiLower = (s: string): string =>
  s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

/**
 * YAML 이 `2025-12-07` 을 Date 로 파싱한다. **로컬 시간으로 읽으면 안 된다** —
 * UTC 기준으로 뽑아야 코퍼스 날짜가 하루 밀리지 않는다.
 */
const dateString = z.union([z.string(), z.date()]).transform((v) =>
  typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10),
);

/** `deck:` 을 비우면 YAML 이 null 을 준다. undefined 로 흡수하지 않으면 빌드가 죽는다. */
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
    /** 한글 원제 보존용. 영문 제목으로 갈아탈 때 원본을 잃지 않는다. */
    titleKo: optText,
    date: dateString,
    /** 인덱스에서 덱이 곧 카드다. 백필 전까지는 비어 있어도 된다. */
    deck: optText,
    /** 하위 뷰(Essay/Research)는 경로가 아니라 이 값으로 가른다. */
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
