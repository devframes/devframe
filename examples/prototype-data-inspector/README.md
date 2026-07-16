# prototype-data-inspector

> **PROTOTYPE — throwaway code.** This is not an example and not a plugin.
> It exists to answer one question and is kept on its spike branch as a
> primary source. Do not merge, extend, or depend on it.

## The question

Can a **data-inspector plugin** work on devframe? Architecture under test:
other plugins/hosts register live server objects into a registry; the UI
composes jora queries that execute **server-side against the live object**;
normalized results return over devframe RPC and render in a **themed
discovery `struct` view** inside a **Vue + `@antfu/design`** workbench, with
saved queries persisted per user or per project.

## Verdict: YES — validated end to end

Stage 1 (`pnpm --filter prototype-data-inspector spike`): **13/13 checks**
against a real programmatic `ViteDevServer` (jora over live objects, Map/Set
bridge methods, normalizer, stat-mode suggestions, function-invocation hazard).

Stage 2 (`pnpm --filter prototype-data-inspector dev`): the full workbench
against the Vite server serving the page itself — left editor / right viewer
split panes, debounced auto-run, client-side syntax gate, non-destructive
errors, per-query stats (jora / normalize / rpc timings, payload size, node
count), remote autocomplete, saved queries in both scopes, synced dark mode.

## The pieces (what the real plugin reuses)

- **`src/registry.ts`** — data sources as
  `{ id, title, description?, getData(): any, static?: boolean }`, registered
  dynamically against the shared `DevframeNodeContext`
  (`WeakMap` idiom from `plugins/git`). `static: true` memoizes `getData()`;
  `registerDataSource` returns an unregister fn and fires change listeners.
- **`src/normalize.ts`** — the core asset: live graph -> strict JSON
  (circular -> `$ref`, Map/Set/class/function/BigInt/Error tagging,
  depth/entry/prop/string caps) with stats.
- **`src/query-engine.ts`** — jora with duck-typed `fromMap()` /
  `mapEntries()` / `fromSet()` / `ownKeys()` / `typeOf()` bridges, plus
  flattened stat-mode suggestions.
- **`src/saved-queries.ts`** — id-keyed saved queries via devframe
  `createStorage` (debounced atomic JSON):
  `user` -> `node_modules/.data-inspector/queries.json` (per checkout),
  `project` -> `.devframe/data-inspector/queries.json` (committable, shared).
  Saving an id into one scope removes its twin from the other.
- **`src/rpc-functions.ts`** — `data-inspector:{sources,query,suggest}` +
  `data-inspector:saved:{list,save,delete}`, all `jsonSerializable`.
- **`src/spa/`** — Vue 3 + `@antfu/design` workbench: canonical uno preset
  block (mirrors `plugins/inspect`), design components used directly
  (`LayoutToolbar`, `LayoutSplitPane`, `FormSelect`, `FormTextInput`,
  `ActionButton`/`ActionIconButton`/`ActionDarkToggle`,
  `DisplayBadge`/`DisplayBytes`/`DisplayDuration`), discovery `ViewModel`
  bound to a container ref with the default page redefined as a struct view.

## Findings (things the real plugin must know)

1. **Vite 8 compat surfaces**: `server.moduleGraph.idToModuleMap` is
   Map-*shaped* but not a `Map` (duck-type it), and compat `ModuleNode`s are
   getter facades whose own keys are `_moduleGraph`/`_clientModule`/`_ssrModule`
   only — query `environments.<name>.moduleGraph` for real own fields.
2. **discovery under Vite** needs `define: { global: 'globalThis' }` and its
   CSS injected into the shadow root via `?inline` import. Render results
   through the model (`page.define('default', ...)` + `setData`) — rendering
   into `dom.pageContent` manually races discovery's own page cycle.
3. **Theming**: `host.colorScheme.set()` + `--discovery-*` custom props
   (bridged to design tokens through CSS vars that flip with `.dark`).
4. **jora syntax check runs client-side** (`jora.syntax.parse`, ~20 KB gzip):
   parse errors carry `details.loc.range`, so end-of-input errors show as a
   soft "keep typing" state and malformed queries never hit the wire.
5. **Suggestions** arrive nested per stat entry (flatten server-side);
   prefix-filtering is the client's job.
6. **`DisplayBadge` with an explicit CSS color** sets fg and bg to the same
   value — pass a hue number (theme-aware tint) or use `variant="solid"`.
7. **`LayoutSplitPane`** needs `splitpanes` (+ `Pane`) as a direct dep — it's
   an `@antfu/design` peer, not a bundled dep.
8. **HAZARD (by design of live-query mode)**: a jora query can invoke any
   function reachable as an own property of the live object and fires own
   getters; no CPU/timeout limits. Present it as eval-grade access to the dev
   server (localhost-only), and pin `jora >= 1.0.0-beta.16`.
9. **Versions pinned deliberately**: `jora@1.0.0-beta.16`,
   `@discoveryjs/discovery@1.0.0-beta.99` — both beta with breaking renames
   between betas.

## Deviations from repo conventions (prototype-only)

- `jora` + `@discoveryjs/discovery` pinned in the *default* catalog (pnpm
  auto-promoted them); a real plugin would place them in a named catalog
- plain textarea editor; production should embed discovery's `QueryEditor`
  (CodeMirror 5 + jora mode) with the async-suggestion re-trigger pattern
- `.vue` internals aren't typechecked (`tsc --noEmit` + shims, same as the
  existing plugins)

## Run it

```sh
pnpm --filter prototype-data-inspector spike   # stage 1: node-only proof, prints 13 checks
pnpm --filter prototype-data-inspector dev     # stage 2: http://localhost:5173/
```
