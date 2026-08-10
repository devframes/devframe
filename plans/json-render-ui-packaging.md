# Plan: json-render as an iframe view provider — one renderer for every UI

> Plan of record settled in a design interview on 2026-08-10. Capture only —
> **not yet implemented**. Implementation lands as a staged GitHub stack
> (bottom → top), each PR passing the full gauntlet
> (`pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build`).
>
> Supersedes the first draft of this file (which had hub-ui reuse
> `@devframes/json-render-ui` as an **in-process Vue `DockRenderer`**). The
> interview pivoted to an **iframe-hosted view-provider** model, which decouples
> json-render from the hub UI's framework entirely.

## Goal

Make "choose or build your own UI" coherent and make json-render + the hub UI
**compose** instead of fuse. Deliver json-render as a **swappable, framework-
agnostic view provider rendered in an iframe**: a hub maps a dock *view type*
(e.g. `json-render`) to a provider SPA; the hub UI renders that type as an
iframe pointing at the provider; when no provider is registered for a type, the
UI shows an explicit empty state. The official provider is
`@devframes/json-render-ui`; community implementations swap it.

**The crux win:** json-render is implemented **once** (json-render-ui's SPA) and
reused by *every* hub UI — Vue, React, vanilla — via an iframe. The current
triplication (json-render-ui Vue + hub-ui's inline Vue copy + the Next example's
React port) collapses to a single implementation.

## Current reality (why this matters)

- `@devframes/json-render` — framework-neutral **core**: catalog/schema (the 14
  catalog-v1 components, `packages/json-render/src/prop-schemas.ts:131`), the
  node factory `createJsonRenderView` (publishes a spec to a shared-state
  `stateKey` + a `JSON_RENDER_INDEX_KEY` entry,
  `packages/json-render/src/node/create-view.ts:131`), and the `/hub` projection
  `DevframeJsonRenderDockEntry` carrying only a **serializable**
  `JsonRenderViewRef = { stateKey } | { spec }` (`packages/json-render/src/hub.ts:11`,
  `view-ref.ts:9`).
- `@devframes/json-render-ui` — the official **Vue** renderer. Already ships a
  standalone **SPA** (`jsonRenderSpaDir` + `createJsonRenderDevframe`,
  `packages/json-render-ui/src/spa.ts:17`) that `connectDevframe()`s and reads
  specs from shared state — but as a **multi-view dashboard** driven by
  `JSON_RENDER_INDEX_KEY` (`packages/json-render-ui/src/spa/main.ts:31`), not a
  single-view renderer pointed at one dock. Also ships an in-process
  `createJsonRenderDockRenderer` (`dock-renderer.ts:14`).
- `@devframes/hub-ui` — the reference viewer. Carries its **own inline Vue
  json-render** copy and renders json-render via a hardcoded `ViewEntry.vue`
  switch → `ViewJsonRender.vue`, on the **deprecated** `entry.ui._stateKey`.
- `examples/next-devframe-hub` — a **third** (React) port of the catalog.

**Machinery we reuse (already exists):**

- A **mounted devframe is already an iframe dock**: `mountDevframe` serves an SPA
  at `<base><id>/` + the shared connection meta, then auto-registers
  `{ type:'iframe', url: base }` (`packages/hub/src/node/mount-devframe.ts:91,103`).
  A "provider SPA" is just a mounted devframe.
- **iframe-pane pooling** keys live iframes by `frameId` and preserves their
  state across tab switches (`packages/hub-ui/src/client/components/views/ViewIframe.vue:74,204`).
- An **iframe SPA under the hub base reads the same shared state / RPC** (one
  socket, relative `./__connection.json`), so a `stateKey` reaches it
  (`packages/json-render-ui/src/spa/main.ts:25,68`).
- **Cross-frame dark/light** already propagates via the `devframes-color-scheme`
  localStorage key (`packages/hub-ui/src/client/state/color-mode.ts:11`), and the
  brand primary is published as `branding.json` (the branding feature, PR #177).

**Gaps this plan fills:** there is no view-type → provider-URL registry, no
single-view mode on the provider SPA, no inline-spec→iframe path, and no
"no provider" placeholder — the only current detection is a `console.warn` in
the in-process renderer seam (`packages/hub/src/client/host.ts:453`).

## Decisions (design interview, 2026-08-10)

1. **Scope**: agree architecture + staged plan; capture as this doc; implement
   later.
2. **General mechanism**: a **view-type → iframe-provider** mapping (any dock view
   type can resolve to a swappable provider SPA), with `json-render` as the
   first/official one.
3. **Iframe is the model**: json-render renders as an iframe provider in hub-ui
   and the examples; the in-process `createJsonRenderDockRenderer` is
   **deprecated**. The hub's in-process `renderers` seam **stays** for niche/
   custom in-process types and `custom-render` — just not for json-render.
4. **Registration**: node-side `initHub({ viewProviders })` mounts each provider
   SPA (via the existing `mountDevframe` path) and maps view-type → its base URL.
   Headless core: `@devframes/hub` takes **no** json-render-ui dependency; the
   app/reference setup wires the official provider. Swap by passing a different
   provider; omit it → placeholder.
5. **Provider descriptor**: a **mountable devframe SPA** (default = json-render-ui's
   SPA). Off-origin/hosted providers work through the existing iframe `remote`
   option as a documented extension, not the v1 focus.
6. **Discovery**: the hub publishes the view-type → base-URL map as a **read-only
   shared-state key** (`devframe:view-providers`), seeded node-side, read by the
   client pre-mount (like `devframe:docks`). Works on both `initHub` and the
   manual `createHubContext` path; needs no `__index.json` fetch. Absent entry =
   placeholder.
7. **View ref → iframe**: the provider SPA gains a **single-view mode**
   (`?view=<stateKey>`) rendering exactly that view from shared state. Entries
   with an inline `spec` are **materialized by the client resolver into an
   ephemeral shared-state key** (disposed on unmount), so the iframe always
   receives a uniform `stateKey`.
8. **Frame model**: **one pooled iframe per view**, `frameId = provider + stateKey`,
   `src = <providerBase>?view=<stateKey>` — reuses iframe-pane pooling (state
   preserved, reused on reselect). No host↔iframe nav protocol.
9. **Placeholder**: hub-ui renders a **built-in empty state** naming the missing
   type ("This host has no `json-render` view provider registered", with a hint to
   register `@devframes/json-render-ui`), detected from the empty
   `devframe:view-providers` entry. No iframe mounted.
10. **Theming the provider iframe**: the provider SPA follows the host via the
    shared same-origin channels — dark/light from `devframes-color-scheme`
    storage, brand primary by fetching the hub's `branding.json` and applying
    `--devframe-primary`. No new protocol.
11. **Catalog growth**: promote hub-ui's extra `Tabs`/`Link`/`Select` into the
    base catalog (additive; port hub-ui's prop shapes) so the one provider renders
    all 17. (Carried over from the prior interview.)
12. **UI selection**: `initHub({ ui })` remains the swap point for the hub UI
    itself; `viewProviders` is the swap point for renderers. Renderer/provider
    packages stay hub-agnostic; document the contracts. No runtime multi-UI
    registry.

## Target architecture

### Package topology

| Package | Role |
|---|---|
| `@devframes/json-render` | Framework-neutral **core** — catalog/schema (**17**), node `createJsonRenderView` (publishes `stateKey` + index), `/hub` projection (`DevframeJsonRenderDockEntry` with `view: JsonRenderViewRef`). |
| `@devframes/json-render-ui` | The **one** renderer, shipped primarily as a **provider SPA** (iframe): `jsonRenderSpaDir` + a `jsonRenderProvider()` factory for `viewProviders`, a **single-view mode** (`?view=<stateKey>`), and `branding.json` theming. The Vue registry/components power the SPA. In-process `createJsonRenderDockRenderer` is **deprecated**. |
| `@devframes/hub` | Headless runtime; gains the **general view-provider mechanism**: `initHub({ viewProviders })` mounts provider SPAs and publishes the read-only `devframe:view-providers` shared-state map. Keeps the in-process `renderers` seam for custom in-process types. No json-render-ui dependency. |
| `@devframes/hub-ui` | Reference viewer. Resolves a provider-backed dock's type → base URL, renders it as a **pooled iframe** (`frameId = provider+stateKey`, `?view=<stateKey>`), materializes inline specs to an ephemeral key, and shows the **no-provider empty state**. No inline json-render, no json-render-ui dependency, no `--jr-primary` bridge. |
| examples (Vite/Vue, Next/React) | BYO references — wire `initHub({ viewProviders: { 'json-render': jsonRenderProvider() } })`; the **React example drops its own json-render port** and uses the shared iframe provider. |

### Composition model — "choose or build your own UI"

- A **hub UI** = a node `DevframeHubUi` provider (`viewer`/`embedded`/`assets`,
  swapped via `initHub({ ui })`) + a client shell.
- **Renderers are iframe view providers**, registered node-side per view type
  (`initHub({ viewProviders })`), swappable, and **framework-agnostic**: the same
  Vue json-render-ui SPA renders inside a Vue, React, or vanilla host because it's
  an iframe. The in-process `DockRenderer` seam remains for niche same-process
  needs but is no longer json-render's path.
- **Data path**: plugin → `createJsonRenderView` (publishes spec to a `stateKey`)
  → dock entry `view: { stateKey }` → hub UI resolves `json-render` → provider
  base, mounts `<base>?view=<stateKey>` → provider SPA reads that `stateKey` off
  the shared socket and renders. Inline `spec` → client writes an ephemeral key
  first.
- **No provider** for a type → hub UI empty state.

## Staged PR stack

Each PR independently shippable, gated by the full gauntlet; land bottom → top.

### PR A — Catalog growth (core) · depends on: —
Add `Tabs`/`Link`/`Select` to `@devframes/json-render` `basePropSchemas` (zod) +
`componentDescriptions`, porting hub-ui's current prop shapes; they flow into
`baseCatalog` automatically. Additive (old specs stay valid). Update `tsnapi`
snapshots.

### PR B — json-render-ui: 17 components + provider SPA · depends on: A
- Implement `Tabs`/`Link`/`Select` in the SPA's registry (→ 17).
- Add **single-view mode** to the SPA: `?view=<stateKey>` renders only that view
  from shared state (keep the index-driven dashboard for standalone use).
- Add **theming**: fetch `branding.json`, apply `--devframe-primary`; dark/light
  via the shared `devframes-color-scheme` key.
- Export **`jsonRenderProvider()`** (a `DevframeDefinition` over `jsonRenderSpaDir`,
  building on `createJsonRenderDevframe`) for `viewProviders`.
- **Deprecate** `createJsonRenderDockRenderer`.

### PR C — hub: general view-provider mechanism · depends on: —
- `InitHubOptions.viewProviders?: Record<string, ViewProviderDef>` — mount each
  provider via the existing `mountDevframe` path and record type → base URL.
- Publish a **read-only `devframe:view-providers`** shared-state map
  (type → `{ base }`), seeded node-side; same on the manual `createHubContext`
  path. Keep the in-process `renderers` seam untouched.
- Document the provider contract (mountable devframe; `remote` URL extension) and
  the (unchanged, structurally-decoupled) `DockRenderer` contract.

### PR D — hub-ui: render providers as iframes · depends on: B, C
- Read `devframe:view-providers` at context init; for a provider-backed dock type
  (json-render + any future type), render a **pooled iframe**
  (`frameId = provider+stateKey`, `src = <base>?view=<stateKey>`) — via
  `ViewIframe` or a thin `ViewProvider.vue`.
- **Inline resolver**: `view: { spec }` → write to an ephemeral shared-state key,
  pass that key, dispose on unmount.
- **No-provider empty state** component, driven by the absent map entry.
- Migrate `ViewEntry.vue` json-render branch to the provider iframe; migrate off
  `entry.ui._stateKey` to `entry.view`. **Delete** `src/client/json-render/`,
  `ViewJsonRender.vue`, the local `DevframeViewJsonRender` type, and the
  `--jr-primary` bridge (json-render now themes itself in its own SPA).

### PR E — examples · depends on: B, C
- Wire `initHub({ viewProviders: { 'json-render': jsonRenderProvider() } })` in the
  Vite and Next examples.
- **Delete the Next example's React json-render registry + dock-renderer** — the
  shared iframe provider renders it. (Supersedes the prior "React example parity"
  decision: no React json-render implementation is needed.)

### PR F — later cycle (out of scope now) · depends on: D, E
Remove the deprecated hub json-render API (`DevframeViewJsonRender`,
`createJsonRenderer`, `_stateKey`) and json-render-ui's deprecated
`createJsonRenderDockRenderer`. Its own breaking-change cycle.

## Interactions & sequencing notes

- **Branding stack (#176, #177)**: PR D deletes the inline json-render and the
  `--jr-primary` bridge #177 added; json-render now themes via `branding.json`
  inside its own SPA (decision 10). Land D after #176/#177 merge (or rebase).
- **Additive catalog**: PR A cannot break existing specs.
- **One implementation everywhere**: after D+E, hub-ui and both examples render
  json-render through the same iframe provider SPA — the triplication is gone and
  the React port is deleted, not duplicated.
- **`__index.json` avoided**: discovery rides `devframe:view-providers` shared
  state (decision 6), sidestepping the manual-path/`__index.json` fetch gap found
  during the branding work.

## Non-goals

- A runtime multi-UI registry or config-file UI selection (decision 12).
- First-party non-Vue renderer packages — unnecessary now that any host reuses the
  Vue provider via iframe (decision 2/3).
- Removing the in-process `renderers` seam (kept for custom in-process types,
  decision 3).
- First-class remote/off-origin providers in v1 (documented extension only,
  decision 5).
- Removing deprecated APIs now (PR F, later cycle).
