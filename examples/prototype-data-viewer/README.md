# prototype-data-viewer

> **PROTOTYPE — throwaway code.** This is not an example and not a plugin.
> It exists to answer one question and is kept on its spike branch as a
> primary source. Do not merge, extend, or depend on it.

## The question

Can a **live-query data-viewer plugin** work on devframe? Architecture under
test (decided 2026-07-16): queries always execute **server-side** against
**live registered objects** (jora), results are normalized and returned over
devframe RPC, and the browser renders them with a **themed discovery `struct`
view** inside devframe-style chrome — with remote autocomplete from jora's
stat mode. No stock discovery explorer page, no client-side dataset.

## Verdict: YES — architecture validated end to end

Stage 1 (`pnpm --filter prototype-data-viewer spike`): **13/13 checks pass**
against a real programmatic `ViteDevServer`.

Stage 2 (`pnpm --filter prototype-data-viewer dev`, then open the page):
full loop works in-browser against the Vite server serving the page itself —
e.g. this query over the live Vite 8 environment module graph:

```jora
environments.client.moduleGraph.idToModuleMap.mapEntries().value.({ url, type, importers: importers.fromSet().url })
```

renders 20 modules in discovery's struct view at `rpc 9ms · jora 0.63ms ·
normalize 0.25ms · 101 nodes`, with server-side suggestions and synced
light/dark theming.

## Findings (things the real plugin must know)

1. **Registry pattern**: `WeakMap<DevframeNodeContext, Map<id, entry>>`
   (`src/registry.ts`) works exactly like `plugins/git/src/rpc/context.ts`.
   The Vite host registers the live server in `configureServer` where both
   the context and the `ViteDevServer` are in scope (`vite.config.ts`).
2. **jora on live objects needs bridging methods** (`src/query-engine.ts`):
   Map/Set are opaque to raw jora, so ship `fromMap()` / `mapEntries()` /
   `fromSet()` / `ownKeys()` / `typeOf()`. **Duck-type Map-likes**: Vite 8's
   backward-compat `server.moduleGraph.idToModuleMap` is a Map-shaped plain
   object, not a `Map` instance.
3. **Vite 8 compat `ModuleNode`s are getter facades** — own keys are only
   `_moduleGraph`/`_clientModule`/`_ssrModule`; the public props live on the
   prototype and are invisible to jora. Query
   `environments.<name>.moduleGraph` instead (real own fields).
4. **The normalizer is the core asset** (`src/normalize.ts`): circular→`$ref`,
   Map/Set/class/function/BigInt/Error tagging, depth/entry/prop/string caps.
   Whole live `ResolvedConfig` → 873 nodes / 24 KB JSON in ~0.5 ms. With it,
   results are strict-JSON (`jsonSerializable: true` RPC).
5. **Remote autocomplete works**: jora stat mode (`{ stat: true, tolerant:
   true }`) runs server-side in ~0.2–0.5 ms; completions arrive nested in a
   `suggestions` array per stat entry — flatten before shipping. Client
   debounces and re-requests (`src/client/main.ts`). jora does NOT
   prefix-filter; that's the client's job (this prototype doesn't).
6. **discovery embeds fine in Vite** with two caveats: it needs
   `define: { global: 'globalThis' }` (throws `global is not defined`
   otherwise — webpack shims this, Vite doesn't), and its CSS ships via
   `?inline` import into the ViewModel's shadow root. Theming =
   `host.colorScheme.set()` + `--discovery-*` custom props set on the host
   element (`themeBridge` in `src/client/main.ts`).
7. **Render path**: `new ViewModel({ container, styles })` →
   `host.view.render(host.dom.pageContent, { view: 'struct', expanded: 2 },
   data, {})`. No `setData` needed for per-query rendering.
8. **HAZARD (by design of live-query mode)**: a jora query can invoke any
   function reachable as an own property of the live object
   (`$f: danger.selfDestruct; $f()` mutated state in the spike — on the real
   server that could be `close()`), and own getters fire during traversal.
   jora also has no CPU/timeout limits. The real plugin must present this as
   eval-grade access to the dev server (localhost-only posture, no third-party
   exposure), and pin `jora >= 1.0.0-beta.16` (JS-injection fix landed in
   beta.14).
9. **Versions pinned deliberately**: `jora@1.0.0-beta.16`,
   `@discoveryjs/discovery@1.0.0-beta.99` — both beta with breaking renames
   between betas; the real plugin should pin exact versions via a catalog.

## Deviations from repo conventions (prototype-only)

- `jora` + `@discoveryjs/discovery` pinned in the *default* catalog (pnpm
  auto-promoted them); a real plugin would place them in a named catalog
- hand-rolled CSS chrome instead of UnoCSS + `@antfu/design` ports
- plain textarea editor; production should embed discovery's `QueryEditor`
  (CodeMirror 5 + jora mode) with the async-suggestion re-trigger pattern

## Run it

```sh
pnpm --filter prototype-data-viewer spike   # stage 1: node-only proof, prints 13 checks
pnpm --filter prototype-data-viewer dev     # stage 2: http://localhost:5173/
```
