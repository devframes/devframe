# Existing JSON-render integration seams

Research snapshot: local checkout `d31b345b18bf66a98ec4cc87ff1a896232e94f7e`; upstream `vitejs/devtools` commit [`1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360`](https://github.com/vitejs/devtools/commit/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360) (`v0.4.2`, 2026-07-21).

## Summary

The repository already has a small hub-owned transport contract: a permissive spec type, a server handle backed by devframe shared state, and a `json-render` dock discriminator. It does not contain a renderer or catalog. `vitejs/devtools` supplies the only current viewer: a Vue shell around `@json-render/vue`, a 14-component catalog/registry, and an unconstrained action-name-to-RPC proxy.

This split works in the Vite hub because the viewer needs only the handle's `_stateKey`. It is not yet a portable devframe feature: standalone dev/build adapters construct the base `DevframeNodeContext`, have no `createJsonRenderer`, and copy an author-provided SPA rather than shipping a JSON-render viewer. Static RPC machinery can snapshot shared-state values, but action/event RPC is intentionally absent from static dumps.

## Current repository

### Hub contract and factory

- [`packages/hub/src/types/json-render.ts`](../../../packages/hub/src/types/json-render.ts) defines handwritten, dependency-free `JsonRenderElement`, `JsonRenderSpec`, and `JsonRenderer` types. An element has `type`, optional `props`, `children`, `on`, `visible`, and `repeat`, plus an open index signature. A spec has `root`, `elements`, and optional `state`. There is no catalog generic, schema validation, action declaration, renderer lifecycle, or upstream `@json-render/core` type identity.
- [`packages/hub/src/define.ts`](../../../packages/hub/src/define.ts) exposes `defineJsonRenderSpec` as an identity helper. The types and helper are public through `@devframes/hub` and `@devframes/hub/types`; the current API snapshot records them in [`tests/__snapshots__/tsnapi/@devframes/hub/index.snapshot.d.ts`](../../../tests/__snapshots__/tsnapi/@devframes/hub/index.snapshot.d.ts).
- [`packages/hub/src/node/context.ts`](../../../packages/hub/src/node/context.ts) adds `createJsonRenderer` only to `DevframeHubContext`. Each call allocates `devframe:json-render:<counter>`, creates a shared state whose value is the complete spec, and returns:
  - `_stateKey`, the actual cross-process locator;
  - `updateSpec`, which replaces the complete shared value;
  - `updateState`, which shallow-merges keys into `spec.state`.
  Keys are allocation-order based, unscoped, and have no stable view ID. Handles have no disposal or listener cleanup, and state entries live for the context lifetime.
- The base context deliberately lacks this factory. [`packages/devframe/src/node/context.ts`](../../../packages/devframe/src/node/context.ts) creates framework-neutral RPC, views, diagnostics, agent, services, and scope surfaces; its comment names JSON rendering as a host augmentation. [`packages/devframe/src/node/scope.ts`](../../../packages/devframe/src/node/scope.ts) namespaces RPC/shared-state/streaming for a tool, but hub additions including `createJsonRenderer` are not carried onto the scoped context.

### Dock projection

- [`packages/hub/src/types/docks.ts`](../../../packages/hub/src/types/docks.ts) defines a `DevframeViewJsonRender` as `{ type: 'json-render', ui: JsonRenderer }` and includes it in both user and projected dock unions.
- [`packages/hub/src/node/host-docks.ts`](../../../packages/hub/src/node/host-docks.ts) stores the original entry. `values()` performs special projection only for remote iframes; it does not explicitly reduce a JSON-render handle to a serializable reference.
- [`packages/hub/src/node/context.ts`](../../../packages/hub/src/node/context.ts) mirrors `docks.values()` into `devframe:docks` (10 ms debounce in dev, 0 ms in build). Therefore in-process consumers see the methods, while wire/static serialization removes function-valued object properties. Devframe's default structured-clone serializer uses `structured-clone-es.stringify`; that function uses JSON/lossy mode, which skips object properties containing functions ([implementation](https://unpkg.com/structured-clone-es@2.0.0/dist/index.mjs), [documented lossy behavior](https://unpkg.com/structured-clone-es@2.0.0/README.md)). The effective client payload is the dock metadata plus `ui._stateKey`, not a callable `JsonRenderer`.
- The public projected dock type consequently overstates what an out-of-process client receives. The Vite viewer is compatible because it reads only `_stateKey`; any extracted viewer must retain a serializable locator or deliberately replace this accidental projection contract.

### Shared-state transport

The complete path is:

1. The hub factory registers the spec under its generated key.
2. A dock entry carrying that handle is mirrored into `devframe:docks`.
3. A client reads the dock list, extracts `_stateKey`, and asks for that shared state.
4. Live server mutations broadcast full snapshots to subscribed sessions; the viewer replaces its spec reference.

The mechanics are in:

- [`packages/devframe/src/utils/shared-state.ts`](../../../packages/devframe/src/utils/shared-state.ts): immutable reads, Immer-backed `mutate`, optional patches, `updated` events, and bounded sync-ID de-duplication.
- [`packages/devframe/src/node/rpc-shared-state.ts`](../../../packages/devframe/src/node/rpc-shared-state.ts): state registry; subscribe/get/set/patch RPC declarations; subscriber-filtered broadcasts. Server-created RPC shared states currently disable patches, so JSON-render updates travel as complete snapshots even when only `spec.state` changes.
- [`packages/devframe/src/client/rpc-shared-state.ts`](../../../packages/devframe/src/client/rpc-shared-state.ts): trust-gated subscription and initial fetch, local state cache, full-state/patch application, and loop prevention. Client writes are suppressed for the static backend.
- [`packages/devframe/src/rpc/serialization.ts`](../../../packages/devframe/src/rpc/serialization.ts): strict JSON only for RPC declarations marked `jsonSerializable: true`; structured-clone encoding otherwise. JSON-render specs are expected to be serializable by design, but the current shared-state getter is not marked JSON-only and therefore does not validate that obligation.

There is no client-to-server synchronization of the renderer provider's internal `$state` merely because it began in `spec.state`. Bound values can be resolved into action parameters by `@json-render/vue`; server visibility requires an RPC action or a separate shared-state write.

### Headless client host

[`packages/hub/src/client/host.ts`](../../../packages/hub/src/client/host.ts) is framework-neutral orchestration, not a viewer. `createDevframeClientHost` connects RPC, subscribes to docks/commands/settings, builds panel/dock/command/when contexts, publishes them on `globalThis`, handles dock activation, and dynamically imports scripts for `action`, `custom-render`, and iframe `clientScript` entries. It neither recognizes nor renders `json-render` entries specially. See also [`packages/hub/src/client/docks.ts`](../../../packages/hub/src/client/docks.ts) and [`packages/hub/src/client/context.ts`](../../../packages/hub/src/client/context.ts).

This is the correct headless boundary: a viewer may consume the shared dock metadata and RPC context, while the hub package itself must not acquire Vue, a component registry, or presentation policy.

### Standalone, hosted, live, and static adapters

- [`packages/devframe/src/adapters/dev.ts`](../../../packages/devframe/src/adapters/dev.ts) creates a base context, runs `definition.setup`, serves an author SPA when `cli.distDir` exists, and exposes live WebSocket RPC. It does not create a hub context or supply a JSON-render UI.
- [`packages/devframe/src/adapters/build.ts`](../../../packages/devframe/src/adapters/build.ts) likewise creates a base build context, runs setup, copies an author SPA verbatim, and writes connection metadata plus RPC dump shards. It has no default renderer assets and cannot directly satisfy a definition that expects `createJsonRenderer`.
- [`packages/devframe/src/adapters/embedded.ts`](../../../packages/devframe/src/adapters/embedded.ts) only runs a definition against a caller-provided context. A hub context can therefore expose the existing factory at runtime, but the definition type remains the base `DevframeNodeContext` and the adapter supplies no viewer.
- [`packages/devframe/src/helpers/vite.ts`](../../../packages/devframe/src/helpers/vite.ts) either mounts static SPA assets or starts the same base standalone dev server as a sidecar. This helper is distinct from the hub-aware Vite DevTools kit.
- [`packages/hub/src/node/mount-devframe.ts`](../../../packages/hub/src/node/mount-devframe.ts) is the hosted hub seam. It serves a devframe's SPA, synthesizes an iframe dock, and runs setup on the hub context. It does not synthesize a JSON-render view from a devframe definition.
- Mount defaults are `/` for standalone and `/__<id>/` for hosted adapters ([`packages/devframe/src/adapters/_shared.ts`](../../../packages/devframe/src/adapters/_shared.ts)). Browser connection discovery is relative to the executing SPA/dump base ([`packages/devframe/src/client/rpc.ts`](../../../packages/devframe/src/client/rpc.ts)). Any standalone JSON-render viewer must preserve this runtime base behavior.
- The type vocabulary includes `spa`, but this checkout has no `createSpa` implementation or `devframe/adapters/spa` export. Current executable adapters are the package exports listed in [`packages/devframe/package.json`](../../../packages/devframe/package.json), and `createCac` currently wires `dev`, `build`, and `mcp` in [`packages/devframe/src/adapters/cac.ts`](../../../packages/devframe/src/adapters/cac.ts).

### Static dump behavior

- `devframe:rpc:server-state:get` declares dump inputs for every registered shared-state key ([`packages/devframe/src/node/rpc-shared-state.ts`](../../../packages/devframe/src/node/rpc-shared-state.ts)). If a build uses a hub context and all renderer/dock states exist before dump collection, both `devframe:docks` and each generated JSON-render state are eligible for snapshots.
- [`packages/devframe/src/rpc/dump/static.ts`](../../../packages/devframe/src/rpc/dump/static.ts) dumps only `static` and configured `query` RPC. It shards query records by argument hash and chooses strict JSON or structured clone from the RPC declaration. `createBuild` writes the manifest/shards and `{ backend: 'static' }` metadata.
- [`packages/devframe/src/client/rpc-static.ts`](../../../packages/devframe/src/client/rpc-static.ts) and [`packages/devframe/src/client/static-rpc.ts`](../../../packages/devframe/src/client/static-rpc.ts) replay those reads. Events are no-ops; missing ordinary calls fail.
- Consequently, a snapshotted JSON-render spec can render read-only, and local input bindings may still work inside the renderer. RPC `action`/`event` declarations are not dumped, so the current action bridge cannot perform server mutations in static output. Static behavior must be specified rather than inferred from the live Vite implementation.
- Build-time ordering matters: shared-state keys must be registered before `collectStaticRpcDump` enumerates them, and dock mirroring is debounced even though build mode uses a zero delay. This path currently has no JSON-render-specific regression test.

## `vitejs/devtools` primary implementation

All links in this section are pinned to commit `1b13d847`.

### Ownership and dependency version

The kit now re-exports JSON-render and dock types from `@devframes/hub` rather than implementing them ([`packages/kit/src/types/json-render.ts`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/kit/src/types/json-render.ts), [`packages/kit/src/types/docks.ts`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/kit/src/types/docks.ts)). `createKitContext` wraps `createHubContext` and only adds Vite config/server slots ([source](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/kit/src/node/context.ts)).

The workspace catalog and lockfile resolve both `@json-render/core` and `@json-render/vue` to **0.19.0** ([workspace catalog](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/pnpm-workspace.yaml), [lockfile](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/pnpm-lock.yaml)). The core tsdown build explicitly bundles both packages ([`packages/core/tsdown.config.ts`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/tsdown.config.ts)). `packages/core/package.json` still records `0.13.0` under its nonstandard `inlinedDependencies` metadata ([source](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/package.json)); that is inconsistent with the source checkout's actual 0.19.0 resolution and should not be treated as the implementation version without artifact verification.

### Vue viewer and action bridge

[`ViewEntry.vue`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/components/views/ViewEntry.vue) lazy-loads the JSON view for `entry.type === 'json-render'`. [`ViewJsonRender.vue`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/components/views/ViewJsonRender.vue) then:

- reads `entry.ui._stateKey`, obtains the corresponding shared state, takes its current value as an upstream `Spec`, and replaces the shallow spec ref on every update;
- shows local loading/error/empty placeholders;
- mounts `JSONUIProvider` with the registry, a handler object, and `spec.state` as `initialState`, then mounts `Renderer` with the spec and registry;
- watches `_stateKey` and reloads, but does not unsubscribe old shared-state listeners or reset loading/error before a reload;
- does not explicitly remount/reset the provider when a replacement spec contains a different initial state.

The action bridge is a `markRaw` proxy whose every string property is considered present. Looking up an action lazily creates and caches a function that calls `context.rpc.call(actionName, params)`. It excludes symbols and Promise-like `then`/`catch`/`finally` probes, catches every RPC failure, logs it to the browser console, and resolves without rethrowing. This permits any action string in a spec to address any RPC method available to that client; there is no catalog/action allowlist, declaration check, argument schema, capability check, loading state, result channel, or static-mode policy.

### Catalog and registry

[`catalog.ts`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/json-render/catalog.ts) defines a Zod-backed catalog with 14 components and an empty `actions` map. [`registry.ts`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/json-render/registry.ts) is an independently maintained `Record<string, Component>` with the same names:

| Component | Current behavior to account for |
| --- | --- |
| `Stack` | Flex row/column, numeric pixel gap/padding, alignment/justification; implementation also accepts undocumented `flex`. |
| `Card` | Border/title and component-local collapsible state. |
| `Text` | Heading/body/caption/code tags and inline typography. |
| `Badge` | Five semantic variants; implementation additionally accepts undocumented `title` and `minWidth`. |
| `Button` | Primary/secondary/ghost/danger, optional remote Iconify icon, emits `press` without an event payload. |
| `Icon` | Fetches Iconify SVG at runtime, sanitizes with DOMPurify, and renders `innerHTML`; failed requests can retry. |
| `Divider` | Rule with optional centered label. |
| `TextInput` | `useBoundProp` two-way binding; emits `change` without the new value on every input event. |
| `Switch` | Accessible `role="switch"`, bound boolean state, emits payload-free `change`; thumb color is hardcoded white. |
| `KeyValueTable` | Two-column text/monospace table. |
| `DataTable` | Sticky headers, optional scroll height, index-keyed rows; `rowClick` emits no row or index. |
| `CodeBlock` | Plain escaped `<pre><code>` with filename/scrolling; declared `language` is unused. |
| `Progress` | Clamped percentage and animated bar; `max = 0` is not specially handled. |
| `Tree` | Recursive object/array viewer with local expansion refs and string/number syntax colors. |

Component sources live under [`packages/core/src/client/webcomponents/json-render/components/`](https://github.com/vitejs/devtools/tree/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/json-render/components). They receive the upstream registry contract (`element`, `on`, `bindings`, `loading`) and use `useBoundProp` for the two inputs. Most styling is inline. [`tokens.ts`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/json-render/components/tokens.ts) mixes a few `--jr-*` variables with hardcoded RGB/RGBA and syntax colors. The implementation ignores the provided `loading` prop.

Compatibility should be measured against observable component names, documented props/defaults, event names, binding behavior, and visual roles—not against incidental shortcomings. Items that require an explicit preserve/reconsider decision include payload-free events, undocumented props, ignored `language`/`loading`, runtime Iconify network access, hardcoded colors, provider state reset semantics, listener cleanup, and arbitrary-RPC actions. The upstream docs and examples are in [`docs/kit/json-render.md`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/docs/kit/json-render.md); the only focused coverage is the gallery Storybook file [`JsonRender.stories.ts`](https://github.com/vitejs/devtools/blob/1b13d847a3fbbdc6ec1b2940f36fd6d3fdf60360/packages/core/src/client/webcomponents/json-render/JsonRender.stories.ts), not behavioral tests.

## Repository constraints

The following constraints come from [`AGENTS.md`](../../../AGENTS.md) and existing package boundaries:

1. **Devframe describes one integration and must remain portable.** A JSON-render view that belongs to a devframe must run outside a multi-tool hub through CLI/live/static/embedded contexts. Dock selection, grouping, and other multi-integration UX remain hub concerns.
2. **The hub is headless.** `@devframes/hub` may own transport/orchestration contracts and dock metadata, but the Vue renderer, component registry, styling, loading surfaces, and default standalone page belong outside the headless hub.
3. **One definition must survive hosted and standalone deployment.** Hosted defaults use `/__<id>/`; standalone defaults use `/`. SPA assets stay relative and discover connection metadata/dumps from runtime location. No integration may assume the Vite DevTools mount or rewrite HTML per deployment.
4. **Live and static are distinct capabilities.** Shared-state query snapshots provide static specs; RPC actions do not exist in static dumps. Static action behavior needs an explicit contract and cannot silently inherit the live arbitrary-RPC bridge.
5. **Shared values are serializable.** Functions are server-local handles and disappear during dock projection. Cross-boundary state needs stable serializable identity, and action/data payloads must respect the selected JSON/structured-clone contract.
6. **Tool isolation and naming matter.** RPC IDs use `defineRpcFunction` and the repository's namespacing convention; scoped contexts already namespace RPC/shared-state/streaming. The current global renderer counter bypasses that isolation.
7. **UI extraction must adopt the repository design system.** Vue uses `@antfu/design` components directly; styling uses the common UnoCSS preset, semantic classes/tokens, dark mode, Phosphor icons, and the shared Storybook setup. The Vite implementation's hardcoded palette and bespoke button/input styling are reference behavior, not conforming destination code.
8. **Packages follow the monorepo contract.** ESM packages under `packages/*` use catalog dependencies, explicit export subpaths, `tsdown`, a package `tsconfig`, `build` and `typecheck` scripts, and committed tsnapi public-API snapshots. Browser/server entry graphs are separated where necessary; see [`packages/devframe/tsdown.config.ts`](../../../packages/devframe/tsdown.config.ts), [`packages/hub/tsdown.config.ts`](../../../packages/hub/tsdown.config.ts), [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml), and [`tests/exports.test.ts`](../../../tests/exports.test.ts).
9. **Node diagnostics are structured.** New node warnings/errors use `nostics` and sequential `DF` codes: core uses `DF00xx–DF07xx`, hub JSON/dock concerns fall in the allocated hub ranges (currently docks are `DF81xx`). Browser-only renderer failures may use `console.*`. Existing definitions are in [`packages/devframe/src/node/diagnostics.ts`](../../../packages/devframe/src/node/diagnostics.ts), [`packages/devframe/src/rpc/diagnostics.ts`](../../../packages/devframe/src/rpc/diagnostics.ts), and [`packages/hub/src/node/diagnostics.ts`](../../../packages/hub/src/node/diagnostics.ts).

## Existing test obligations and gaps

- Generic shared-state synchronization has only narrow client coverage ([`packages/devframe/src/client/rpc-shared-state.test.ts`](../../../packages/devframe/src/client/rpc-shared-state.test.ts)); static dump collection and replay have broad generic coverage ([`packages/devframe/src/rpc/dump/__tests__/static.test.ts`](../../../packages/devframe/src/rpc/dump/__tests__/static.test.ts), [`packages/devframe/src/client/static-rpc.test.ts`](../../../packages/devframe/src/client/static-rpc.test.ts)).
- Hub tests cover dock registration/projection, grouping, activation, shared dock seeding, and client-host reconciliation/scripts ([`packages/hub/src/node/__tests__/host-docks.test.ts`](../../../packages/hub/src/node/__tests__/host-docks.test.ts), [`packages/hub/src/node/__tests__/context.test.ts`](../../../packages/hub/src/node/__tests__/context.test.ts), [`packages/hub/src/client/__tests__/host.test.ts`](../../../packages/hub/src/client/__tests__/host.test.ts)).
- No local test mentions `createJsonRenderer`, `JsonRenderer`, `_stateKey`, or a `json-render` dock. There is therefore no direct guard for key allocation, update semantics, lossy dock projection, multiple renderers, build ordering, static replay, disposal, or reconnection.
- The public types are guarded only indirectly by tsnapi snapshots. Upstream has Storybook rendering coverage but no focused action, binding, update, error, or accessibility tests in the JSON-render directory at the pinned commit.

## Consequential compatibility obligations

Without choosing a final public API, the existing behavior establishes these obligations for later design work:

- Preserve a complete serializable spec snapshot and reactive whole-spec replacement; decide whether state-only updates continue as whole snapshots or gain a narrower transport.
- Preserve the ability for a hub dock to carry only a serializable renderer reference, while correcting the current type/projection mismatch.
- Keep the renderer/viewer replaceable and outside the headless hub; make the same devframe-owned view reachable in standalone live and static outputs.
- Account for all 14 component names, documented props/defaults, `press`/`change`/`rowClick`, `$bindState`, and initial state when assessing extraction compatibility.
- Replace or explicitly constrain the current arbitrary action-string RPC bridge; its permissiveness is observable behavior but conflicts with the plan's declared-action direction and static safety.
- Treat static rendering as read-only unless a separate static interaction policy is defined; never imply that dumped action RPC will execute.
- Add behavioral coverage across live shared state, static dumps, hub projection/viewer integration, standalone rendering, component events/bindings, and cleanup. Existing generic tests are useful seams but do not prove JSON-render behavior.
