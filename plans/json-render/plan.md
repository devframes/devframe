# JSON Render Packages — Implementation Plan

A single, concrete plan for `@devframes/json-render` and `@devframes/json-render-ui`. It resolves every open decision from the earlier wayfinder map into firm choices and an ordered implementation sequence, grounded in two primary-source studies kept alongside this file:

- [Upstream json-render contracts](research/upstream-json-render.md) — `@json-render/core@0.19.0` / `@json-render/vue@0.19.0`.
- [Existing JSON-render integration seams](research/existing-integration-seams.md) — this repo and `vitejs/devtools@v0.4.2`.

Scope is this repository. Implementing, publishing, or releasing the packages, and adopting them in `vitejs/devtools`, are out of scope. Where a choice is genuinely contestable it is marked **Decision** with the reasoning; treat those as the default to build against, not as reopened questions.

## Destination

Two packages plus the devframe/hub changes that host them:

- `@devframes/json-render` — the devframe-native, framework-neutral protocol package. Owns the versioned spec schema, the versioned base catalog and extension model, the declared-action contract and validator, the runtime view factory (`createJsonRenderView`), and a curated re-export of `@json-render/core`. No Vue, no DOM, no presentation.
- `@devframes/json-render-ui` — the official Vue renderer. Implements the base catalog with `@antfu/design`, ships the renderer shell, the default standalone SPA, and Storybook. Third-party registries can replace it.

A single view definition authored once renders standalone (CLI/dev/build/SPA/embedded) and inside a hub dock, live or static, with the official Vue UI or a substituted registry.

## 1. Package ownership and exports (resolves decision 03)

### `@devframes/json-render`

Location `packages/json-render/`. ESM, `tsdown`, own `tsconfig.json` (extends `tsconfig.base.json`), `build` + `typecheck` scripts, committed tsnapi snapshot. Two entry graphs kept separate so the node factory never pulls browser code:

| Subpath | Contents |
| --- | --- |
| `.` (isomorphic) | Protocol schema + types, base catalog, extension composition, action-declaration builder, validator, catalog-compatibility helper. Pure data + Zod; safe in node and browser. |
| `./node` | `createJsonRenderView` and devframe integration helpers (touch RPC/shared-state/scope). Node only. |
| `./core` | Curated named re-exports of `@json-render/core@0.19.0` (see below). |

**Curated core re-export (`./core`).** Explicit named list, never `export *`. Each name is a Devframes semver commitment; adding or removing one is a Devframes API change. Initial set, per the upstream study: `defineSchema`, `defineCatalog`, catalog inference types, `Spec`, `UIElement`, state/visibility/prop/action types and resolvers, `StateStore`, `createStateStore`. Excluded from the base: prompt/generation/edit/devtools hooks and all streaming primitives (may return later as an opt-in `./core/stream` subpath). `@json-render/core` is pinned to **exact `0.19.0`**; bumping it requires re-running the compatibility tests.

**Dependencies.** `@json-render/core` exact-pinned (catalog `inlined`), `zod ^4` aligned to core's instance (catalog `types`/`inlined`). `devframe` is a **peer** (the node helpers augment a devframe context; they never fork it). No dependency on `@devframes/hub`.

**Type names.** `DevframeJsonRenderSpec`, `DevframeJsonRenderCatalog`, `JsonRenderView`, `JsonRenderViewRef`, `JsonRenderActionDeclaration`, `JsonRenderExtension`. These replace the hub's hand-written `JsonRenderSpec` / `JsonRenderer`.

### `@devframes/json-render-ui`

Location `packages/json-render-ui/`. Same monorepo contract plus a Storybook. Subpaths:

| Subpath | Contents |
| --- | --- |
| `.` | `createRenderer()` shell, base Vue registry, `defineRegistry`/`extendRegistry`, provider lifecycle wiring, loading/error surfaces. |
| `./components` | Individual ported components for direct import / third-party reuse. |
| `./spa` | Prebuilt standalone SPA entry assets (relative base) consumed by devframe adapters. |

**Dependencies.** `@devframes/json-render` (peer + workspace), `@json-render/vue` exact-pinned `0.19.0` (paired with core), `vue ^3.5` (peer), `@antfu/design` (dev, build-time). Never a dependency of the protocol package — Vue stays out of the protocol.

### Dependency direction

```
@devframes/json-render-ui ──▶ @devframes/json-render ──▶ devframe (peer)
                                        │                 @json-render/core (pinned)
@devframes/hub ─────────────────────────┘  (dock discriminator references JsonRenderViewRef)
```

The hub depends on `@devframes/json-render` only for the serializable `JsonRenderViewRef` used in its dock discriminator. It never imports the Vue UI.

## 2. Protocol: catalog, state, actions (resolves decision 04)

**Devframes owns the wire contract.** A `DevframeJsonRenderSpec` is validated against a Devframes-authored Zod schema, structurally compatible with core `Spec`/`UIElement` but not derived from upstream typing (the study shows upstream typing checks names, not per-component props or actions). Every spec carries `protocolVersion: 1` and `catalog: { id, version, extensions: [{ id, version }] }`.

**Base catalog v1** = the fourteen components inventoried in the seams study (`Stack`, `Card`, `Text`, `Badge`, `Button`, `Icon`, `Divider`, `TextInput`, `Switch`, `KeyValueTable`, `DataTable`, `CodeBlock`, `Progress`, `Tree`), with props/defaults normalized: documented props only, typed event payloads (`Button.press`, `TextInput.change`, `Switch.change`, `DataTable.rowClick` carry their value/row/index), and `language`/`loading` honored. Undocumented upstream props (`Stack.flex`, `Badge.title`/`minWidth`) are either promoted to documented props or dropped — each decided in the component port, not silently accepted. Catalog is versioned (`catalogVersion` independent of `protocolVersion`).

**Extensions.** An extension is `{ id, version, components, actions }`. Composition is explicit and collision-on-duplicate is an **error** (no upstream last-write-wins). Base is the portable floor; `$computed` and custom directives, which execute host code, are extension-only capabilities, never base assumptions.

**State.** `Record<string, unknown>` addressed by JSON Pointer, JSON-serializable. Spec structure is replaced whole on update; **state updates travel as JSON-Pointer patches** over shared state (enable patches for this server-created state — they are currently disabled, per the seams study). This keeps state syncs narrow without a whole-spec broadcast.

**Actions — declared allowlist, no catch-all bridge.** This is the central correction to the Vite implementation's arbitrary action-string→RPC proxy. Each view declares its actions up front:

```ts
declareAction('reload', { params: z.object({ id: z.string() }) })
```

- Client dispatch: the action name must be in the view's allowlist and params must parse against the declared schema **before** any RPC crosses the boundary. Unknown names refuse to dispatch (no probing a Proxy).
- Server: the RPC handler re-validates name + params at the trust boundary.
- Reserved client-local built-ins (no RPC): `setState`, `pushState`, `removeState`, `validateForm`, matching upstream semantics.

**Serialization.** Strict JSON only for specs and state; the shared-state getter is marked `jsonSerializable: true` so the obligation is enforced, not assumed.

**Validation timing & failure.** Validate spec on the server at declaration and on every update; reject invalid specs with a `DF` diagnostic. Validate action name + params on the client before dispatch and again on the server. Browser-side render failures follow upstream's per-element isolation (render that element as null) and use `console.*`; node-side failures use `nostics`.

**Streaming / generative UI.** Excluded from v1. A complete remote spec renders without it. If adopted later, reuse core's patch semantics (core throws on failed RFC-6902 `test`; the Vue hook treats it as a no-op) behind an opt-in subpath, with patch validation and resource limits.

## 3. Devframe runtime integration (resolves decision 05)

The JSON-render view is a **devframe-level** integration, not hub-only — it must run standalone. `createJsonRenderView` lives in `@devframes/json-render/node` and augments a base `DevframeNodeContext` through its existing scope/RPC/shared-state/views surfaces. The hub's `createJsonRenderer` is removed and its callers migrated.

```ts
const view = createJsonRenderView(ctx, {
  id: 'metrics',            // author-provided, stable
  spec,
  actions: { reload, clear },
})
view.update(spec)
view.patchState([{ op: 'replace', path: '/count', value: 3 }])
view.dispose()
```

- **Identity.** Scoped stable IDs `devframe:json-render:<scope>:<id>`, replacing the global allocation-order counter. Stable across reconnects and rebuilds.
- **Lifecycle.** `dispose()` unregisters the shared state and its listeners; no leak for the context lifetime.
- **Scoped actions.** Registered as scoped RPC via `defineRpcFunction` under the namespacing convention, validated as in §2.
- **Static.** Build dumps the spec + state as a shared-state query snapshot (read-only render). Actions are **not** dumped; a declared static policy renders action-bound controls in an explicit "unavailable in static output" state rather than silently inheriting live behavior. Local input bindings still work in the renderer.
- **Standalone UI assets.** When a definition declares json-render views and the author ships no SPA, the `dev`/`build`/`spa` adapters serve `@devframes/json-render-ui/spa` (relative base, runtime connection discovery preserved). Author SPAs still win.
- **View primitive.** Reuse the existing devframe `views` surface; the json-render view is a typed specialization, not a new primitive.

## 4. Hub projection and renderer substitution (resolves decision 06)

- **Serializable dock ref.** The dock discriminator becomes `{ type: 'json-render', view: JsonRenderViewRef }` where `JsonRenderViewRef = { stateKey, protocolVersion, catalog }` — no functions. This fixes the accidental `_stateKey` projection and the current type/projection mismatch where the projected `JsonRenderer` overstates what crosses the wire.
- **Headless host.** `createDevframeClientHost` gains a `json-render` branch that resolves a renderer implementation from a host-registered registry (default `@devframes/json-render-ui`, overridable by the UI kit), checks catalog compatibility (`catalog.id`/`version`/extensions) before mounting, drives loading/error states, and disposes on dock deactivation (unsubscribing shared-state listeners the Vite viewer currently leaks). The hub package itself acquires no Vue.
- **Migration.** `packages/hub/src/types/json-render.ts`, `defineJsonRenderSpec`, and `createJsonRenderer` move to `@devframes/json-render`; the hub re-exports `JsonRenderViewRef` for its dock type only. tsnapi snapshots for `@devframes/hub` update accordingly.

## 5. Official Vue + Antfu Design UI (resolves decision 07)

`@devframes/json-render-ui` ships:

- **Base registry** implementing catalog v1's fourteen components, each ported to `@antfu/design` semantic tokens (`bg-base`/`color-muted`/`border-base`…), the shared UnoCSS preset stack, Phosphor `i-ph:*` icons, and dark mode via `.dark`. Reference behavior is the Vite catalog; conforming code replaces its hardcoded RGB palette and bespoke button/input styling.
- **Intentional changes from the Vite catalog:** typed event payloads; honor `language` (syntax highlighting) and `loading`; **Decision** — replace runtime Iconify network fetch + DOMPurify `innerHTML` with build-time Phosphor icons mapped by name (removes per-render network access and an HTML-injection surface); provider state reset made explicit on view-identity/protocol change (remount/reset vs preserve).
- **Renderer shell** wiring `JSONUIProvider` + `Renderer` with the Devframes action bridge (declared allowlist, not the catch-all proxy), seeding `spec.state`, and owning remount/reset semantics.
- **Registry extension** via `defineRegistry`/`extendRegistry` for catalog extensions; third-party registries replace the whole registry.
- **Standalone SPA** entry (relative assets, OS-preference dark flip) under `./spa`.
- **Storybook** following the repo's one setup (co-located stories, `viteFinal` + `unocss/vite`, `.dark` toggle, `bg-base color-base` decorator) covering every component, loading/error, and a full sample view.

## 6. End-to-end prototype (resolves decision 08)

Before the spec is frozen, build one disposable prototype (scratch under `examples/`, deleted after) exercising all seams: one view authored once; rendered standalone by the official Vue registry; mounted in a hub dock; re-rendered by a swapped third-party registry; updated through a declared live action and a state patch; emitted as a static snapshot. Its only output is confirmation (or correction) of ownership, naming, lifecycle, and configuration ergonomics feeding §7.

## 7. Implementation sequence

Each step is an independently reviewable slice; ⟶ marks the dependency.

1. **Scaffold `@devframes/json-render`** — manifest, `tsdown.config.ts` (isomorphic/node/core graphs), `tsconfig.json`, `typecheck` script, empty tsnapi snapshot, catalog deps, exact core pin.
2. **Protocol core** ⟶1 — spec Zod schema, base catalog v1, extension composition (collision = error), catalog-compatibility helper, validator, `DF` diagnostics. Unit tests.
3. **Declared-action contract** ⟶2 — action builder, param validation, reserved built-ins, client + server validators.
4. **Runtime factory** ⟶3 — `createJsonRenderView` (scoped IDs, shared state, JSON-Pointer state patches enabled, scoped action RPC, `dispose`), `jsonSerializable` getter.
5. **Hub migration** ⟶4 — move types/factory out of hub, `JsonRenderViewRef` dock discriminator, correct projection, update hub tsnapi.
6. **Scaffold `@devframes/json-render-ui` + base registry** ⟶2 — package, fourteen ported components, tokens, Storybook.
7. **Renderer shell + action bridge** ⟶3,6 — provider/renderer wiring, declared-action bridge, loading/error, reset semantics.
8. **Client-host projection** ⟶5,7 — `json-render` branch, renderer registry/injection, compatibility check, lifecycle/disposal.
9. **Standalone adapters + SPA** ⟶4,7 — serve default SPA from `./spa`; static snapshot + static-action policy.
10. **Prototype** ⟶8,9 — validate ergonomics; feed corrections back.
11. **Test matrix** ⟶ across — see §8.
12. **Docs + error pages** ⟶ across — package docs, `docs/errors/DFxxxx.md` for each new code.

## 8. Test matrix (resolves the map's deferred slices)

Behavioral coverage, since the seams study shows no current test touches `createJsonRenderer`, `_stateKey`, or a json-render dock:

- Protocol: valid/invalid spec, per-component prop validation, extension collision, catalog compatibility.
- Actions: allowlist enforcement, param schema pass/fail, reserved built-ins, server re-validation, rejection of undeclared names.
- Runtime: scoped ID stability, `update`/`patchState`, disposal + listener cleanup, multiple concurrent views, reconnect.
- Transport: whole-spec replace vs state patch, `jsonSerializable` enforcement, shared-state broadcast.
- Hub: serializable dock projection (no functions), client-host renderer selection/injection, compatibility gate, deactivation disposal.
- Standalone: live dev render; static build ordering (states registered before dump), static replay read-only, static-action policy.
- Vue UI: each component's props/defaults/events/bindings (`press`/`change`/`rowClick`/`$bindState`), loading/error, reset-on-identity-change; Storybook render.
- Snapshots: tsnapi for both packages and the updated hub; `tests/exports.test.ts` subpaths.

## 9. Diagnostics

New node diagnostics use `nostics` with sequential `DF` codes. `@devframes/json-render` is core-side protocol/runtime → allocate in the core range (next free after the current highest `DF00xx`); hub projection changes stay in the hub dock range (`DF81xx`). Suggested set: invalid spec, unknown/invalid action, catalog incompatibility, duplicate extension id, view id collision, disposed-view use. Each gets a `docs/errors/DFxxxx.md` page. Browser-only render failures keep `console.*`.

## 10. Acceptance criteria

- One view definition renders standalone (dev/build/spa/embedded) and in a hub dock, live and static, with the official Vue UI and a substituted registry.
- No arbitrary action-string→RPC path exists anywhere; every action is declared and param-validated on both sides.
- Dock projection carries only serializable data; no function survives to the wire, and the projected type matches what the client receives.
- Views have stable scoped IDs and dispose cleanly with no leaked shared state or listeners.
- The hub and devframe packages acquire no Vue; the Vue UI is fully replaceable.
- `pnpm lint && pnpm test && pnpm typecheck && pnpm build` pass, with tsnapi snapshots and exports tests updated.

## Out of scope

- Implementing, publishing, or releasing the packages (this plan is the specification).
- Changing `vitejs/devtools` to consume the packages or deleting its current implementation.
- Official React/Solid/Svelte/vanilla registries — third-party compatibility is specified through the core contract only.
- Agent-driven / generative UI beyond keeping the base catalog compatible with json-render.
