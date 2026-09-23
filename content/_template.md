---
title: ""
titleKo: ""
date:
deck: ""
type:
tags: []
draft:
---

Copy this file to `content/writing/<slug>.md`, fill the front matter in from the top, and
replace everything below with the post. Keep it out of `content/writing/` while it is a
template: the collection loads every `.md` in that directory, and a blank has no date.

The filename is the address. A file named `tso.md` dated 2026-03-04 is published at
`/writing/2026/tso/`, so the slug is worth choosing before the first save and is awkward
to change afterwards — the old URL does not redirect.

Leave any line you have nothing to say on exactly as it ships. Blank does not mean an
empty element on the page: a blank field parses to nothing at all, and every page tests
for a value before it draws anything, so a blank `deck:` produces no deck paragraph
rather than an empty one. Only `title` and `date` have to be filled in.

**title** — required, and the string the post is known by everywhere: the heading, the
entry on /writing/, the browser tab, the feed item, the search result. Quoted because a
title containing `:` or opening with `#` breaks an unquoted YAML value.

**titleKo** — the original Korean title of a post that now carries an English one. No page
prints it today; it is kept so a rename does not lose the first title. Blank: nothing.

**date** — required, `YYYY-MM-DD`. It orders the whole site and supplies the year segment
of the URL, so changing it later moves the post's address. It ships blank on purpose: a
date inherited from a template is the day the template was written, and that wrong date
would be baked into the URL. Blank stops the build with `date is not YYYY-MM-DD: (none)`.

**deck** — the line under the title, set in the display face, saying what the post is. It
is also the page's `<meta name="description">` and the post's description in the RSS feed.
Blank: no deck is drawn, and the description falls back to the opening sentence of the
post itself.

**type** — `essay` or `research`, and nothing else; any other word stops the build. It is
published as a `data-type` attribute on the entry in /writing/, which is what a later
split into sub-views would key on. Blank: the attribute is omitted and the post is
untyped, which is what every post on the site is today.

**tags** — a list, written `tags: ["dns", "network"]`. The brackets ship filled in because
they are the shape: a bare word after the colon is a string, not a list, and is rejected.
Nothing on the site renders tags yet, so they are for the archive rather than the page.
Blank or `[]`: no tag list, and the content gate prints a warning naming the post.

**draft** — `true` withholds the post: it is dropped from /writing/ and from the feed, and
no page is generated for it, so its URL 404s. `false` publishes, and so does a blank line;
`yes` and `no` are words here, not booleans, and stop the build.
It ships blank rather than `true` because a template that hides whatever is written from
it produces a post that reads as finished, builds clean, and is nowhere on the site.
