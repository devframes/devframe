# AGENTS GUIDE

## Positioning

**`devframe`** is the framework-neutral container for one devtool integration, portable across viewers. Build a single tool (its RPC, its SPA, its diagnostics, its CLI/build/spa/embedded outputs) without caring how it'll be displayed. A devframe app runs standalone (CLI, static deploy, embedded SPA) just as well as it mounts inside a hub.

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
pnpm typecheck    # tsc --noEmit
pnpm lint --fix   # ESLint via @antfu/eslint-config
pnpm start        # tsx src/index.ts
```

The `pnpm test` script intentionally runs `build` first so `tsnapi` snapshots compare against fresh `dist/`. `tsdown-stale-guard` enforces this in `test/api-snapshot.test.ts`.

## Conventions

- RPC functions must use `defineRpcFunction`; always namespace IDs (`my-plugin:fn-name`).
- Shared state via `devframe/utils/shared-state`; keep values serializable.
- Utility imports use the package-path form `devframe/utils/*`, never relative `../utils/*`.
- Dependencies go through the pnpm catalogs in `pnpm-workspace.yaml` (`cli`, `inlined`, `testing`, `types`) — add to a catalog and reference as `catalog:<name>`, don't pin versions in `package.json`.

### Devframe design principles

These reinforce devframe's positioning as "the container for one devtool integration, portable to multiple viewers". When in doubt, err on the side of "devframe provides primitives, the hub provides UX".

- **Single-integration scope.** Devframe describes one tool. If a feature only makes sense when multiple tools share a UI — docking, a unified command palette, cross-tool toasts, terminal aggregation — it belongs in a hub package, not here.
- **Headless by default.** No default startup banners, no opinionated logging to stdout, no default styling. Provide hooks (`onReady`, `cli.configure`, etc.); let the application print its own branding. Structured diagnostics via `nostics` are fine — ad-hoc `console.log`s baked into adapters are not.
- **Mount path depends on adapter context.** Given `id: 'foo'`, the default mount path is `/__foo/` for *hosted* adapters (`vite`, `embedded`) and `/` for *standalone* adapters (`cli`, `spa`, `build`). Authors override via `DevframeDefinition.basePath`. Don't hardcode mount paths in adapter code paths that may run standalone.
- **SPAs own their basePath at runtime.** Build SPAs with relative asset paths (`vite.base: './'`); discover the effective base in the browser from the executing script's location / `document.baseURI`. `createBuild` / `createSpa` copy SPA output verbatim — no HTML rewriting, no build-time `--base` injection. The client (`connectDevframe`) resolves `.connection.json` relative to the runtime base automatically.
- **CLI flags compose from both sides.** The `cac` instance backing `createCli` is exposed both to the `DevframeDefinition` (`cli.configure(cli)`) — for capabilities contributed by the tool itself — and to the `createCli` caller — for flags added at the final assembly stage. Parsed flag values are forwarded to `setup(ctx, { flags })`. Never hardcode domain-specific flags into `createCli`.

## Structured Diagnostics (Error Codes)

All node-side warnings and errors use structured diagnostics via [`nostics`](https://www.npmjs.com/package/nostics). Never use raw `console.warn`, `console.error`, or `throw new Error` with ad-hoc messages in node-side code — always define a coded diagnostic.

Prefix: **`DF`**. Codes are sequential 4-digit numbers (e.g. `DF0033`). Check the existing diagnostics file to find the next available number.

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
