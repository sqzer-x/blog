# blog.sqzer.com

Personal research notes. Built with Astro, deployed to GitHub Pages by GitHub Actions.

## Writing

```bash
cp content/_template.md content/writing/my-post.md
npm run dev
```

One file in `content/writing/<slug>.md` is one post. The filename becomes the URL slug,
and the published address takes its year from the front matter `date`:
**`/writing/<year>/<slug>/`**.

```yaml
---
title: ""        # required
titleKo: ""      # optional — keeps the original Korean title when a post is translated
deck: ""         # one sentence shown beside the title in the index. May be empty for now
date: 2026-09-17 # required, YYYY-MM-DD
type: essay      # essay | research — sub-navigation splits on this
tags: []
draft: true      # excluded from the build while true
---
```

Drafts stay local until they are finished. **This repository is public.**

Images live in `public/uploads/` and are referenced from prose as `/uploads/...`.

## Deploying

Pushing to `main` builds the site and publishes it to Pages. A content gate runs before the
build (`npm run prebuild`), so a schema violation, a URL collision or a missing image
reference **stops the deploy** instead of shipping a broken page.

```bash
npm run check    # gate only
npm run build    # gate, then build
```

Strictness is controlled by `CONTENT_STRICT` in the workflow. It is `urls,schema` today;
once decks and tags are backfilled it moves to `all` and does not move back.
