/**
 * Fail the build when a content entry comes back without a body.
 *
 * Astro's glob loader catches any exception a Markdown render throws, logs one line and
 * stores the entry with `rendered` undefined (astro/dist/content/loaders/glob.js). `render()`
 * then returns a Content component that emits nothing, while everything around it — title,
 * byline, description, feed item, sitemap entry — still builds, and `astro build` exits 0.
 * The post ships as a title over an empty column. A throw from page code does fail the
 * build, so every page that renders an entry calls this first.
 *
 * The loader only re-renders a file whose contents changed, so a failure cached by an
 * earlier build comes back with no log line at all. The message says how to get it back.
 */
export function assertRendered(entry: { id: string; filePath?: string; rendered?: { html: string } }): void {
  const file = entry.filePath ?? entry.id;
  if (!entry.rendered) {
    throw new Error(
      `${file} did not render. The cause is the "Error rendering" line logged above; if there ` +
        `is none, an earlier build cached the failure. Rerun with \`npm run build -- --force\`.`,
    );
  }
  if (!entry.rendered.html.trim()) throw new Error(`${file} rendered to an empty body.`);
}
