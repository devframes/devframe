# JSON Render Packages — Implementation Plan

A single, concrete plan for `@devframes/json-render` and `@devframes/json-render-ui`, reflecting the decisions settled in a full design-tree interview. It is grounded in two primary-source studies kept alongside this file:

- [Upstream json-render contracts](research/upstream-json-render.md) — `@json-render/core@0.19.0` / `@json-render/vue@0.19.0`.
- [Existing JSON-render integration seams](research/existing-integration-seams.md) — this repo and `vitejs/devtools@v0.4.2`.

Scope is this repository. This PR is **documentation only** — the plan and research; no package scaffolding or code. Implementing, publishing, or releasing the packages, and adopting them in `vitejs/devtools`, are follow-up efforts.

This plan intentionally **supersedes** the earlier wayfinder destination on two points: it does **not** adopt a declared-action allowlist (the action bridge is unrestricted, §4), and it **defers** incremental named catalog extensions (v1 replaces the whole registry instead, §7).

## Destination

Two opt-in packages plus the devframe/hub changes that host them, so that JSON-render is a capability a devframe app *adds*, never a cost a plain app pays:

- `@devframes/json-render` — the opt-in, framework-neutral protocol layer. Augments a devframe context with a view factory; owns the spec/catalog types, the base catalog and its Devframes-authored prop schemas, the serializable view reference, and (when a hub is present) contributes the `json-render` dock type. Uses upstream `@json-render/core` as its wire contract. No Vue, no DOM.
- `@devframes/json-render-ui` — the official reference frontend library: a Vue renderer implementing the base catalog with `@antfu/design`. Any compatible frontend library can replace it.

A single view definition authored once renders standalone (the app supplies a compatible frontend lib) and inside a hub dock (the hub supplies the frontend lib), live or static.

## 1. Package relationship

```
devframe (core)          — no json-render awareness; a plain app pulls ZERO json-render deps
   ▲ peer
@devframes/json-render   — OPT-IN protocol layer; augments a devframe ctx (arrow is json-render → devframe only)
   ▲ peer
@devframes/json-render-ui — OFFICIAL / reference compatible frontend lib (others may be compatible)

@devframes/hub           — json-render-AGNOSTIC; extensible dock types; registerRenderer() routes a dock
                            type to a registered renderer; NO json-render dependency
```

- **`devframe` core stays clean.** It never imports json-render. The current base-context doc comment that names `createJsonRenderer` as a host augmentation is removed. A devframe app that doesn't declare JSON-render views has no new dependency.
- **`@devframes/json-render` is the opt-in layer.** It peer-depends on `devframe` and augments an existing `DevframeNodeContext` through the context's own scope / RPC / shared-state / views surfaces — it does not fork the context. Depends on `@json-render/core` (caret, §3) and `zod`.
- **`@devframes/json-render-ui` is the reference frontend.** It peer-depends on `@devframes/json-render` and `vue`, depends on `@json-render/vue` (caret, paired with core), and dev-depends on `@antfu/design`. It is never a dependency of the protocol package — Vue stays out of the protocol.
- **`@devframes/hub` gains no json-render dependency** (§5).

### Deployment modes

- **Standalone.** The author opts in with `devframe` + `@devframes/json-render` + a compatible frontend lib (`@devframes/json-render-ui`, or another). The `dev` / `build` adapters and the `vite` helper serve that lib's SPA. devframe bundles no renderer by default.
- **Hub-mounted.** The app provides `@devframes/json-render` (protocol + view); the **hub provides the frontend lib** to render, through its client-host `registerRenderer()` (default `@devframes/json-render-ui`). The app need not bundle a UI.

## 2. Package layout and exports

### `@devframes/json-render`

`packages/json-render/`. ESM, `tsdown`, own `tsconfig.json`, `build` + `typecheck` scripts, committed tsnapi snapshot. Node and browser entry graphs kept separate:

| Subpath | Contents |
| --- | --- |
| `.` (isomorphic) | Base catalog + Devframes-authored per-component prop schemas, `JsonRenderViewRef`, and the re-exported protocol types. Pure data + Zod. |
| `./node` | `createJsonRenderView` and devframe integration helpers (RPC/shared-state/scope). Node only. |
| `./core` | Curated named re-exports of `@json-render/core` (below). |

**`./core` re-export — builders + types only.** Explicit named list, never `export *`: `defineSchema`, `defineCatalog`, catalog inference types, `Spec`, `UIElement`, `StateStore`, `createStateStore`. Excludes streaming, prompt/generation, and devtools hooks. Each name is a Devframes semver commitment.

**Type names.** `DevframeJsonRenderSpec` (alias of upstream `Spec`), `JsonRenderView`, `JsonRenderViewRef`. These replace the hub's hand-written `JsonRenderSpec` / `JsonRenderer`.

### `@devframes/json-render-ui`

`packages/json-render-ui/`. Same monorepo contract plus a Storybook.

| Subpath | Contents |
| --- | --- |
| `.` | `createRenderer()` shell, base Vue registry, provider lifecycle wiring, action bridge, loading/error surfaces. |
| `./components` | Individual ported components for direct import / reuse. |
| `./spa` | Prebuilt standalone SPA entry assets (relative base) served by devframe adapters. |

## 3. Upstream coupling

- **Upstream is the wire contract.** A Devframes spec *is* an `@json-render/core` `Spec`; the Vue `schema` is accepted **as-is**. Devframes does not author a bespoke spec schema and does not extend the schema to validate the fields the Vue schema omits (`state`, `on`, `repeat`, `watch`) — those pass structurally unchecked.
- **Per-component prop validation is the one validation Devframes adds.** Because upstream `defineCatalog` collapses multi-component `propsOf` to `Record<string, unknown>`, Devframes authors a Zod prop schema per base component and parses element props against it at **both** boundaries: at spec ingress (server, in `createJsonRenderView` update — reject invalid props with a `DF` diagnostic) and at render time (client renderer, isolate a bad element).
- **Caret range** on `@json-render/core` and `@json-render/vue` (`^0.19.0`, kept paired). No compatibility test suite; the committed **lockfile is the only guard** against a breaking upgrade. This is an accepted risk given the pre-1.0 upstream.
- **Compatibility signal is the upstream package version.** No Devframes protocol/catalog version stamp.
- **Streaming / generative-UI is out of v1.** A complete remote spec renders without it; it may return later behind an opt-in `./core/stream` subpath, reusing core's patch semantics.
- **License.** Apache-2.0, compatible; keep required notices for any redistributed upstream object code and avoid implying Vercel endorsement.

## 4. Actions, state, and validation

- **Action bridge is unrestricted.** An element event maps to an action whose name is dispatched as an RPC call — any spec action string calls any RPC method the client can reach (the current `vitejs/devtools` behavior). There is no declared-action allowlist and no param validation. The capability implication — a spec, or anything that can write one to shared state, can invoke any client-reachable RPC — is accepted.
- **Improve on the Vite bridge's quality.** Unlike the current proxy, the bridge tracks per-action loading state and surfaces RPC failures to the view rather than silently swallowing them to the console.
- **State** is `Record<string, unknown>` addressed by JSON Pointer, JSON-serializable. **State updates travel as JSON-Pointer patches** (enable patches on this server-created shared state, currently disabled); a structural change replaces the whole spec.
- **Serialization.** Strict JSON only for specs and state; the shared-state getter is marked `jsonSerializable: true` so the obligation is enforced.
- **Reserved client-local built-ins** (no RPC): `setState`, `pushState`, `removeState`, `validateForm`, per upstream semantics.

## 5. Devframe runtime integration

`createJsonRenderView` lives in `@devframes/json-render/node` and augments a base `DevframeNodeContext`:

```ts
const view = createJsonRenderView(ctx, { id: 'metrics', spec })
view.update(spec)
view.patchState([{ op: 'replace', path: '/count', value: 3 }])
view.dispose()
```

- **Identity.** Scoped stable IDs `devframe:json-render:<scope>:<authorId>` (author-supplied, stable); a duplicate id within a scope raises a `DF` diagnostic. Replaces the current global allocation-order counter.
- **Lifecycle.** `dispose()` unregisters the shared state and its listeners.
- **Static output.** The build dumps the spec + state as a shared-state query snapshot (read-only render). Action RPC is not dumped; controls whose elements carry `on` handlers render **disabled** with an "unavailable in static output" affordance. Local state/bindings still work.
- **Default UI.** No renderer is bundled into devframe. When a definition declares JSON-render views and the author has added a compatible frontend lib, the `dev` / `build` adapters and the `vite` helper serve that lib's `./spa` assets (relative base, runtime connection discovery preserved). The `spa` adapter is wired when `createSpa` lands. Under a hub the hub supplies the renderer instead.
- **View primitive.** Reuse the existing devframe `views` surface; the JSON-render view is a typed specialization.

## 6. Official Vue + Antfu Design UI

`@devframes/json-render-ui` ships:

- **Base registry** implementing catalog v1's fourteen components (`Stack`, `Card`, `Text`, `Badge`, `Button`, `Icon`, `Divider`, `TextInput`, `Switch`, `KeyValueTable`, `DataTable`, `CodeBlock`, `Progress`, `Tree`) on `@antfu/design` semantic tokens, the shared UnoCSS preset, and dark mode via `.dark`. Reference behavior is the Vite catalog; the hardcoded RGB palette and bespoke button/input styling are replaced by semantic tokens.
- **Corrections from the Vite catalog:** typed event payloads (`Button.press`, `TextInput.change`, `Switch.change`, `DataTable.rowClick` carry their value/row/index); `CodeBlock` honors `language`; components honor `loading`; provider state reset is explicit (see below).
- **Icons are fully dynamic.** The `Icon` component resolves whatever icon name a spec supplies at runtime (sanitized), with no preferred or bundled icon set. This is a deliberate, documented deviation from the repo's Phosphor-first icon convention, which applies to a surface's own chrome, not to spec-driven content icons.
- **Renderer shell** wiring the upstream provider + renderer with the unrestricted action bridge (§4), seeding `spec.state`, and owning reset semantics: **reset provider state on view-identity or upstream-version change; preserve it across ordinary spec/state updates.**
- **Registry replacement.** A third party replaces the whole registry (there is no incremental extension in v1, §7).
- **Standalone SPA** under `./spa` (relative assets, OS-preference dark flip).
- **Storybook** following the repo's one setup, covering every component, loading/error, and a full sample view.

## 7. Hub projection and renderer substitution

- **The hub is json-render-agnostic.** Its dock union becomes **extensible/open** rather than hard-coding a `json-render` variant; the opt-in `@devframes/json-render` integration contributes the `json-render` dock type and its serializable ref. `@devframes/hub` carries **no** json-render dependency. This enlarges the migration: the current closed `DevframeViewJsonRender` variant and the `createJsonRenderer` factory are removed from hub.
- **Serializable dock ref.** `JsonRenderViewRef = { stateKey, upstreamVersion }` — no functions, no Devframes catalog version. This fixes the accidental `_stateKey` projection and the current type/projection mismatch.
- **`registerRenderer()` on `@devframes/hub/client`.** Configured at `createDevframeClientHost` boot; the host application injects `@devframes/json-render-ui` as the default. The client-host routes a dock type to its registered renderer, drives loading/error, and disposes on deactivation (unsubscribing shared-state listeners the Vite viewer leaks). A renderer/upstream-version mismatch logs a warning rather than blocking. The hub package itself acquires no Vue.
- **Extensions deferred.** v1 supports the versioned base catalog plus whole-registry replacement. Incremental named extensions (add-on components with their own identity/version) are post-v1 — they clash with the upstream-version-only compatibility model and add protocol surface now.

## 8. Implementation sequence

Each step is an independently reviewable slice; ⟶ marks the dependency.

1. **Scaffold `@devframes/json-render`** — manifest, `tsdown.config.ts` (isomorphic/node/core graphs), `tsconfig.json`, `typecheck`, empty tsnapi snapshot, caret core dep.
2. **Protocol surface** ⟶1 — `./core` re-exports, base catalog + per-component Zod prop schemas, `JsonRenderViewRef`, `DF` diagnostics. Unit tests.
3. **Runtime factory** ⟶2 — `createJsonRenderView` (scoped IDs, shared state, JSON-Pointer state patches enabled, ingress prop validation, `dispose`), `jsonSerializable` getter.
4. **Hub decoupling** ⟶2 — open the dock union, remove `createJsonRenderer` + the closed json-render variant from hub, add `registerRenderer()` to the client host, regenerate hub tsnapi.
5. **Scaffold `@devframes/json-render-ui` + base registry** ⟶2 — package, fourteen ported components (dynamic `Icon`), tokens, Storybook.
6. **Renderer shell + action bridge** ⟶2,5 — provider/renderer wiring, unrestricted bridge with loading/error, render-time prop validation, reset semantics.
7. **Client-host routing** ⟶4,6 — dock-type → registered renderer, default injection, disposal.
8. **Standalone adapters + SPA** ⟶3,6 — serve the author's frontend lib `./spa`; static snapshot + static-action affordance.
9. **Prototype** ⟶7,8 — one disposable end-to-end prototype (one view: standalone + hub dock + swapped registry + live update + static snapshot); feed ergonomics back before finalizing.
10. **Test matrix** ⟶ across — §9.
11. **Docs + error pages** ⟶ across — package docs, `docs/errors/DFxxxx.md` per new code.

## 9. Test matrix

- Protocol: per-component prop validation (ingress + render), catalog membership.
- Runtime: scoped ID stability, `update` / `patchState`, disposal + listener cleanup, multiple concurrent views, reconnect.
- Transport: state-patch vs whole-spec replace, `jsonSerializable` enforcement, shared-state broadcast.
- Actions: bridge dispatch, per-action loading, error surfacing.
- Hub: extensible dock projection (no functions on the wire), client-host renderer routing/injection, version-mismatch warning, deactivation disposal.
- Standalone: live dev render; static build ordering (states registered before dump), static replay read-only, static-action affordance.
- Vue UI: each component's props/defaults/events/bindings (`press`/`change`/`rowClick`/`$bindState`), dynamic icon resolution, loading/error, reset-on-identity/version-change; Storybook render.
- Snapshots: tsnapi for both new packages and the updated hub; `tests/exports.test.ts` subpaths.

## 10. Diagnostics

New node diagnostics use `nostics` with sequential `DF` codes. `@devframes/json-render` protocol/runtime → the core range (next free after the current highest `DF00xx`); hub dock changes stay in the hub dock range (`DF81xx`). Set: invalid element props (ingress), duplicate view id, disposed-view use, catalog/registry error. Browser-only render failures keep `console.*`.

## 11. Acceptance criteria

- A plain devframe app pulls no json-render dependency; JSON-render is added only by depending on `@devframes/json-render`.
- One view definition renders standalone (the app's frontend lib) and in a hub dock (the hub's registered renderer), live and static.
- `@devframes/hub` and `devframe` acquire no Vue and no json-render dependency respectively; the frontend lib is fully replaceable via `registerRenderer()`.
- Dock projection carries only serializable data; no function survives to the wire, and the projected type matches what the client receives.
- Views have stable scoped IDs and dispose cleanly with no leaked shared state or listeners.
- Element props are validated at ingress and render; the action bridge surfaces loading and errors.
- `pnpm lint && pnpm test && pnpm typecheck && pnpm build` pass, with tsnapi snapshots and exports tests updated.

## Out of scope

- Implementing, publishing, or releasing the packages (this plan is the specification).
- Changing `vitejs/devtools` to consume the packages or deleting its current implementation.
- Official React/Solid/Svelte/vanilla frontend libs — other frontends are supported through registry replacement, not shipped here.
- A declared-action allowlist, a Devframes protocol/catalog version, incremental named catalog extensions, and streaming — each explicitly deferred or declined above.
