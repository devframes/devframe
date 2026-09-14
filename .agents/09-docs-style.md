# 09 - Documentation style

These rules apply to every Markdown file under `docs/` (error reference pages are template-driven and exempt). Apply them on every doc edit, not just dedicated revision passes.

## 1. Positive framing

Describe what *is*, not what *isn't*. Replace constructions like "X is for Y, not Z" or "there is no X for Y" with the closest natural positive phrasing. Features that don't exist yet MUST NOT be documented - release notes are the place for "now supported" announcements; docs describe what works today.

- ❌ "Build mode only; dev mode is not supported yet."
- ✅ "Analyses production builds in Vite 8+."

## 2. Use callouts sparingly

Callouts (`> [!NOTE]`, `> [!TIP]`, `> [!INFO]`, `::: tip`, etc.) interrupt the reading flow and must earn their visual weight. Default to prose; reach for a callout only for genuinely critical material.

- **`[!WARNING]` / `[!DANGER]`** - security hazards, footguns, breaking-change pitfalls, experimental-API stability warnings. Keep these.
- **Bad-practice "✗" inline blocks** - fine inside code samples to contrast with a `✓` good example.
- **Everything else** - fold into the surrounding prose.

## 3. Concise and precise

Trim filler intros, redundant cross-links (one link per page is enough - sidebars handle navigation), and code samples that demonstrate more than the point being made. Lead each page with one sentence that says what the reader can build with this. Strip out promises about future work, marketing language ("powerful", "seamless"), and exposition that the surrounding code already conveys.

## 4. Guides teach, references list

The docs separate learning material from lookup material, following the [Divio documentation system](https://docs.divio.com/documentation-system/):

- **Guide pages (`docs/content/1.guide/`) are learning-oriented** - prose, code examples, and explanation. A lookup table (definition fields, options, enums, statuses, event names, route tables) belongs on a references page, with the guide keeping a one-or-two-sentence prose summary of the essentials plus a link to the reference section. Comparison and decision tables ("X vs Y", trade-off matrices) are explanation and stay in the guides; navigational link tables stay on `index.md` pages.
- **The references section (`docs/content/8.references/`) holds the lookup tables**, grouped: [Node-Side API](../docs/content/8.references/4.node-api.md), [Browser-Side API](../docs/content/8.references/5.browser-api.md), and [Hub API](../docs/content/8.references/6.hub-api.md), alongside the terms, when-clauses, and events pages. Each reference section opens with one line naming what the table lists and linking the guide page that teaches it. A new lookup table goes into the matching reference page (and the references `index.md`), never into a guide.
- **The adapters, frameworks, helpers, and plugins sections are per-package reference pages** - each page is the reference for its own adapter/kit/package, so its options and RPC tables stay in place.

## What goes where

- Critical security / data-loss hazard → `[!WARNING]` callout.
- Experimental API / stability caveat → `[!WARNING]` callout at the top of the page.
- Bad-practice contrast → inline `// ✗ Bad` / `// ✓ Good` comments inside code blocks.
- Lookup table for a guide topic → the matching `docs/content/8.references/` page; the guide keeps a prose summary + link.
- Anything else worth saying → prose.
