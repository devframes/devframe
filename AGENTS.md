# AGENTS GUIDE

## Positioning

**`devframe`** is the framework-neutral container for one devtool integration, portable across viewers. Build a single tool (its RPC, its SPA, its diagnostics, its CLI/build/spa/embedded outputs) without caring how it'll be displayed. A devframe app runs standalone (CLI, static deploy, embedded SPA) just as well as it mounts inside a hub.

**`@devframes/hub`** is the framework-neutral hub layer that sits on top of devframe and provides the multi-integration orchestration (docks, terminals, messages, commands). It does not ship UI — implementers (e.g. `@vitejs/devtools-kit`) provide their own UI on top of the hub's RPC + shared-state protocol. It does ship a **headless client runtime** (`createDevframeClientHost()` from `@devframes/hub/client`): booted in the host page, it assembles the shared `DevframeClientContext` (panel, docks, commands, when) and imports each dock entry's client script (`action` / `custom-render` / iframe `clientScript`) into that page — how a plugin like the a11y inspector runs code inside the page being inspected. See `examples/minimal-vite-devframe-hub/` for a working ~120-line Vite host demonstrating the protocol end to end.

## Stack & Structure

ESM TypeScript library. Bundled with `tsdown`. Tested with `vitest`. pnpm workspaces with catalog dependencies (`pnpm-workspace.yaml`); workspace globs reserve `playground`, `docs`, `packages/*`, `examples/*` for future additions.

Source layout:
- `src/` — library code; entry `src/index.ts`
- `test/` — vitest specs; API snapshots via `tsnapi` under `test/__snapshots__/`
- `dist/` — `tsdown` build output (committed to npm tarball via `files`)

## Development

```sh
pnpm install      # requires pnpm@11.x
pnpm build        # tsdown
pnpm dev          # tsdown --watch
pnpm test         # pnpm build && vitest (api snapshot guards against stale dist)
pnpm typecheck    # turbo run typecheck (per-package tsc --noEmit)
pnpm lint --fix   # ESLint via @antfu/eslint-config
pnpm start        # tsx src/index.ts
```

The `pnpm test` script intentionally runs `build` first so `tsnapi` snapshots compare against fresh `dist/`. `tsdown-stale-guard` enforces this in `test/api-snapshot.test.ts`.

`pnpm typecheck` fans out through Turbo: every workspace package owns a `"typecheck": "tsc --noEmit"` script and its own `tsconfig.json` (extending `tsconfig.base.json` with an explicit `include`). Cross-package imports resolve to source through the `paths` aliases in `tsconfig.base.json`, so no prior build is needed. Any package added under `packages/*` or `plugins/*` is typechecked automatically once it ships that `typecheck` script — add one to every new package so it can't silently skip type errors.

`pnpm typecheck` runs `scripts/verify-typecheck-coverage.ts` first — it fails the command (and CI, since CI just runs `pnpm typecheck`) if any workspace package has a `tsconfig.json` but no `typecheck` script, so a new package can't silently join the same blind spot. A package that genuinely can't typecheck yet needs a documented exception in that script, not a missing script.

## Conventions

- RPC functions must use `defineRpcFunction`; always namespace IDs (`my-plugin:fn-name`).
- Shared state via `devframe/utils/shared-state`; keep values serializable.
- Utility imports use the package-path form `devframe/utils/*`, never relative `../utils/*`.
- Dependencies go through the pnpm catalogs in `pnpm-workspace.yaml` (`cli`, `inlined`, `testing`, `types`) — add to a catalog and reference as `catalog:<name>`, don't pin versions in `package.json`.

### Design system

All five built-in plugins — and every example under `examples/` — share one design system, [`@antfu/design`](https://github.com/antfu/design), so they look and feel like one product across frameworks (Git is React/Next, terminals is Svelte, code-server is vanilla DOM, inspect is Vue, a11y is Solid, the examples are Preact/Next/vanilla). It's a dev dependency consumed at build time: its UnoCSS preset and shipped styles drive every surface, and its Vue components are the canonical reference every framework matches. There is no shared internal design package — each app wires the preset itself and owns its own component ports.

- **Respect the skills.** This design system is built to the `antfu` and `antfu-design` skills (UnoCSS-first, class-based semantic tokens, dual light/dark, anti-slop) — load and follow them when building or changing any UI here. The surfaces deliberately echo the upstream devtools they descend from; reference their UI/UX when in doubt: [`antfu/node-modules-inspector`](https://github.com/antfu/node-modules-inspector), [`antfu/vite-plugin-inspect`](https://github.com/antfu/vite-plugin-inspect), [`eslint/config-inspector`](https://github.com/eslint/config-inspector), and [`vitejs/devtools` → `packages/rolldown`](https://github.com/vitejs/devtools/tree/main/packages/rolldown).
- **One preset, wired per app.** Each consumer's `uno.config.ts` composes the same stack: `presetAnthonyDesign({ primary })` (from `@antfu/design/unocss`, tuned to devframe's sage green) + `presetWind4()` + `presetIcons()` (Phosphor) + `presetWebFonts()` (DM Sans / DM Mono) + `transformerDirectives()` + `transformerVariantGroup()`, plus the named `z-*` layers the nav/overlay surfaces reference (`z-nav`, `z-dropdown`, `z-tooltip`, `z-toast`, `z-modal-*`, `z-drawer-*`) — `presetAnthonyDesign` blocks plain `z-<number>` so every layer is named. Keep the block identical across apps so the surfaces stay consistent.
- **Tokens are semantic shortcuts.** Build UI from `@antfu/design`'s class vocabulary — surfaces `bg-base` / `bg-secondary` / `bg-active`, text `color-base` / `color-muted` / `color-faint` / `color-active`, `border-base`, `op-fade` / `op-mute` — never a hardcoded palette. Import `@antfu/design/styles.css` (or cherry-pick `@antfu/design/styles/base.css` + `scrollbar.css`) once per page; dark mode is the `.dark` class on `<html>`, flipped from the OS preference in the SPA entry.
- **Vue uses the components directly; other frameworks port them.** The Vue surface (inspect) imports components straight from `@antfu/design/components/*` (`ActionButton`, `ActionIconButton`, `DisplayBadge`, `LayoutTabs`, `LayoutToolbar`, `LayoutCard`, …). Every non-Vue surface ports the components it needs into its own framework — React in git and the Next examples, Svelte in terminals, Solid in a11y, Preact in the Preact examples, vanilla DOM helpers in code-server and the Vite hub — mirroring the upstream component's markup, classes and behavior so it renders identically. Port on demand: recreate only what a surface uses, and keep each port faithful to its `@antfu/design` source.
- **One nav, three buttons, one tab selector — strictly.** Every surface opens with the same top bar — a `LayoutToolbar`-style row led by a brand block (a primary-tinted `i-ph:*` icon + the product name). Buttons come in exactly three forms: a **text button** (`ActionButton` → `btn-action` / `btn-primary`), a **bordered icon button** (`ActionIconButton` → `btn-icon-square`), and a **borderless icon button** (round `btn-icon`). Multi-view tools (inspect, git) switch views with the one shared segmented selector (`LayoutTabs` `variant="segment"`: a `bg-secondary` track with `data-[state=active]:bg-base` triggers). Don't invent bespoke nav bars, button shapes, or tab styles.
- **Icons** come from the shared Phosphor set (`i-ph:*`, duotone preferred) via `presetIcons` — use them everywhere instead of per-consumer icon libraries or bespoke SVG.
- **A surface keeping its own component CSS** (inspect, a11y) sources every color from `@antfu/design`'s semantic shortcuts via `--at-apply` (expanded by `transformerDirectives`) rather than hardcoding a palette, so it tracks the shared theme and the `.dark` class.
- **Plain `.ts`/vanilla views** must opt `.ts` into UnoCSS extraction (`content.pipeline.include` for Vite, or `content.filesystem` globs for the `@unocss/postcss` setup Next uses), since UnoCSS only scans framework files by default.
- **Storybook.** Each plugin's storybook follows one setup — co-located `*.stories.*`, a `viteFinal` that adds the framework plugin + `unocss/vite` (pointed at the plugin's `uno.config`), `@antfu/design/styles.css`, a `theme` toggle on the `.dark` class, and a `bg-base color-base` decorator. The Vue surface (inspect, `@storybook/vue3-vite`) showcases the `@antfu/design` components in real use — the visual reference the React/Svelte/Solid/vanilla ports match, mirroring [`@antfu/design`'s own storybook](https://github.com/antfu/design/tree/main/storybook).

### Devframe design principles

These reinforce devframe's positioning as "the container for one devtool integration, portable to multiple viewers". When in doubt, err on the side of "devframe provides primitives, the hub provides UX".

- **Single-integration scope.** Devframe describes one tool. If a feature only makes sense when multiple tools share a UI — docking, a unified command palette, cross-tool toasts, terminal aggregation — it belongs in a hub package, not here.
- **Headless by default.** No default startup banners, no opinionated logging to stdout, no default styling. Provide hooks (`onReady`, `cli.configure`, etc.); let the application print its own branding. Structured diagnostics via `nostics` are fine — ad-hoc `console.log`s baked into adapters are not.
- **Mount path depends on adapter context.** Given `id: 'foo'`, the default mount path is `/__foo/` for *hosted* adapters (`vite`, `embedded`) and `/` for *standalone* adapters (`cli`, `spa`, `build`). Authors override via `DevframeDefinition.basePath`. Don't hardcode mount paths in adapter code paths that may run standalone.
- **SPAs own their basePath at runtime.** Build SPAs with relative asset paths (`vite.base: './'`); discover the effective base in the browser from the executing script's location / `document.baseURI`. `createBuild` / `createSpa` copy SPA output verbatim — no HTML rewriting, no build-time `--base` injection. The client (`connectDevframe`) resolves `.connection.json` relative to the runtime base automatically.
- **CLI flags compose from both sides.** The `cac` instance backing `createCac` is exposed both to the `DevframeDefinition` (`cli.configure(cli)`) — for capabilities contributed by the tool itself — and to the `createCac` caller — for flags added at the final assembly stage. Parsed flag values are forwarded to `setup(ctx, { flags })`. Never hardcode domain-specific flags into `createCac`.

## Structured Diagnostics (Error Codes)

All node-side warnings and errors use structured diagnostics via [`nostics`](https://www.npmjs.com/package/nostics). Never use raw `console.warn`, `console.error`, or `throw new Error` with ad-hoc messages in node-side code — always define a coded diagnostic.

Prefix: **`DF`**. Codes are sequential 4-digit numbers (e.g. `DF0033`). Check the existing diagnostics file to find the next available number.

Range allocation:
- `DF00xx–DF07xx` — `devframe` core (RPC, host, storage, streams, …)
- `DF80xx–DF89xx` — `@devframes/hub`. Sub-ranges:
  - `DF80xx` — hub context / lifecycle
  - `DF81xx` — docks
  - `DF82xx` — terminals
  - `DF83xx` — messages
  - `DF84xx` — commands
  - `DF85xx` — built-in RPC commands

### Adding a new error

1. **Define the code** in the appropriate `diagnostics.ts`:
   <!-- eslint-skip -->
   ```ts
   DF0033: {
     why: (p: { name: string }) => `Something went wrong with "${p.name}"`,
     fix: 'Optional resolution hint for the user.',
   },
   ```

2. **Use the diagnostics** at the call site:
   ```ts
   import { diagnostics } from './diagnostics'

   // For thrown errors — always prefix with `throw` for TypeScript control flow:
   throw diagnostics.DF0033({ id, reason })

   // For reported warnings/errors (not thrown). The default console method is `warn`;
   // override with the 2nd-arg reporter options when needed:
   diagnostics.DF0033({ id, reason }) // console.warn
   diagnostics.DF0033({ id, reason }, { method: 'error' }) // console.error
   diagnostics.DF0033({ id, reason, cause: error }, { method: 'warn' }) // attach cause
   ```

3. **Create a docs page** at `docs/errors/DF0033.md` (when `docs/` lands):
   ```md
   ---
   outline: deep
   ---
   # DF0033: Short Title

   ## Message
   > Something went wrong with "`{name}`"

   ## Cause
   When and why this occurs.

   ## Example
   Code that triggers it.

   ## Fix
   How to resolve it.

   ## Source
   - [`src/node/filename.ts`](...) — `functionName()` throws this when …
   ```

   The `## Source` section lists each call site that emits the code, with a one-line role per entry. Don't list the `diagnostics.ts` definition — it's implied.

### Scope

- **Node-side only.**
- **Client-side excluded**: browser-only code keeps using `console.*` / `throw`.

## Before PRs

```sh
pnpm lint && pnpm test && pnpm typecheck && pnpm build
```

Follow conventional commits (`feat:`, `fix:`, etc.).

## Documentation style

These rules apply to every Markdown file under `docs/` once it exists (error reference pages are template-driven and exempt). Apply them on every doc edit, not just dedicated revision passes.

### 1. Positive framing

Describe what *is*, not what *isn't*. Replace constructions like "X is for Y, not Z" or "there is no X for Y" with the closest natural positive phrasing. Don't document features that don't exist yet — release notes are the place for "now supported" announcements; docs describe what works today.

- ❌ "Build mode only; dev mode is not supported yet."
- ✅ "Analyses production builds in Vite 8+."

### 2. Use callouts sparingly

Callouts (`> [!NOTE]`, `> [!TIP]`, `> [!INFO]`, `::: tip`, etc.) interrupt the reading flow and should earn their visual weight. Default to prose; reach for a callout only for genuinely critical material.

- **`[!WARNING]` / `[!DANGER]`** — security hazards, footguns, breaking-change pitfalls, experimental-API stability warnings. Keep these.
- **Bad-practice "✗" inline blocks** — fine inside code samples to contrast with a `✓` good example.
- **Everything else** — fold into the surrounding prose.

### 3. Concise and precise

Trim filler intros, redundant cross-links (one link per page is enough — sidebars handle navigation), and code samples that demonstrate more than the point being made. Lead each page with one sentence that says what the reader can build with this. Strip out promises about future work, marketing language ("powerful", "seamless"), and exposition that the surrounding code already conveys.

### What goes where

- Critical security / data-loss hazard → `[!WARNING]` callout.
- Experimental API / stability caveat → `[!WARNING]` callout at the top of the page.
- Bad-practice contrast → inline `// ✗ Bad` / `// ✓ Good` comments inside code blocks.
- Anything else worth saying → prose.
