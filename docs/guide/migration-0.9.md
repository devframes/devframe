---
outline: deep
---

# Migrating to 0.9

0.9 removes the compatibility shims that were deprecated across the 0.7 series and trims the public API surface of `devframe` and `@devframes/hub` down to what integrations actually consume. Each change has a drop-in replacement, so migrating is a matter of updating import paths and a handful of call sites. This page covers the changes between 0.8.x and 0.9.

## `devframe/adapters/cli` is removed

The CLI adapter was renamed to `cac` in 0.7. The `devframe/adapters/cli` entry — `createCli`, `CreateCliOptions`, and `CliHandle` — is now gone. Import from `devframe/adapters/cac` instead:

| 0.8.x | 0.9 |
|-------|-----|
| `import { createCli } from 'devframe/adapters/cli'` | `import { createCac } from 'devframe/adapters/cac'` |
| `CreateCliOptions` | `CreateCacOptions` |
| `CliHandle` | `CacHandle` |

```ts
// 0.8.x
import { createCli } from 'devframe/adapters/cli'

await createCli(devframe).parse()
```

```ts
// 0.9
import { createCac } from 'devframe/adapters/cac'

await createCac(devframe).parse()
```

The typed-flag helpers `defineCliFlags` and `parseCliFlags` live on `devframe/adapters/cac` too. See [CLI (cac)](/adapters/cac) for the full adapter reference.

## `devframe/recipes/open-helpers` is removed

The recipe was renamed to `common-rpc-functions` in 0.7.16. Import `commonRpcFunctions` from `devframe/recipes/common-rpc-functions`:

```ts
// 0.8.x
import { openHelpers } from 'devframe/recipes/open-helpers'
```

```ts
// 0.9
import { commonRpcFunctions } from 'devframe/recipes/common-rpc-functions'
```

The `openInEditor` and `openInFinder` members are unchanged. See [Common RPC functions](/helpers/common-rpc-functions) for the full reference.

## RPC dump re-exports move to `devframe/rpc/dump`

The static-dump helpers and types are served from the dedicated `devframe/rpc/dump` entry; the aliases that re-exported them from the top-level `devframe/rpc` barrel are removed. Import them from `devframe/rpc/dump`:

```ts
// 0.8.x
import { createClientFromDump, dumpFunctions } from 'devframe/rpc'

// 0.9
import { createClientFromDump, dumpFunctions } from 'devframe/rpc/dump'
```

This applies to every dump export — `collectStaticRpcDump`, `createClientFromDump`, `dumpFunctions`, `getDefinitionsWithDumps`, `reviveDumpError`, `serializeDumpError`, and the `StaticRpcDump*` types.

## `@devframes/hub` json-render shims are removed

json-render moved out of the hub into the opt-in [`@devframes/json-render`](./json-render) integration in 0.7. The hub-local compatibility shims are now removed: the `defineJsonRenderSpec` helper, the `ctx.createJsonRenderer` factory, the `DevframeViewJsonRender` dock type, and the `JsonRenderSpec` / `JsonRenderElement` / `JsonRenderer` types.

| 0.8.x (`@devframes/hub`) | 0.9 (`@devframes/json-render`) |
|---|---|
| `defineJsonRenderSpec(spec)` | Pass the spec directly to `createJsonRenderView(ctx, { id, spec })` |
| `ctx.createJsonRenderer(spec)` | `createJsonRenderView(ctx, { id, spec })` (from `@devframes/json-render/node`) |
| `JsonRenderSpec` | `DevframeJsonRenderSpec` |
| `JsonRenderElement` | element shape of `DevframeJsonRenderSpec` |
| `JsonRenderer` | `JsonRenderView` |
| `DevframeViewJsonRender` | `DevframeJsonRenderDockEntry` (from `@devframes/json-render/hub`) |

```ts
// 0.8.x
import { defineJsonRenderSpec } from '@devframes/hub'

const spec = defineJsonRenderSpec({ root: 'panel', elements: { /* ... */ } })
const renderer = ctx.createJsonRenderer(spec)
```

```ts
// 0.9
import { createJsonRenderView } from '@devframes/json-render/node'

const view = createJsonRenderView(ctx, {
  id: 'panel',
  spec: { root: 'panel', elements: { /* ... */ } },
})
```

`createJsonRenderView` returns a view carrying a serializable `ref` (a shared-state key or an inline spec). Project it onto a hub dock with `toJsonRenderDockEntry` from `@devframes/json-render/hub`, which contributes the `'json-render'` dock type to the hub's open dock union. A dock entry now carries that serializable `view` ref rather than a live renderer handle — a client reads `entry.view.stateKey` (or `entry.view.spec`) to render it.

See [JSON-Render](./json-render) for the full integration reference.

## `defineDevframe` moves to the package root

`defineDevframe` — the primary authoring helper — now lives on the `devframe` entry point alongside `defineRpcFunction`. `devframe/types` is now strictly type-only. Import both values and types from `devframe`:

| 0.8.x | 0.9 |
|-------|-----|
| `import { defineDevframe } from 'devframe/types'` | `import { defineDevframe } from 'devframe'` |
| `import type { DevframeNodeContext } from 'devframe/types'` | `import type { DevframeNodeContext } from 'devframe'` |

```ts
import type { DevframeNodeContext } from 'devframe'
// 0.9
import { defineDevframe, defineRpcFunction } from 'devframe'
```

`devframe/types` still resolves as the type-only subpath — useful for `declare module 'devframe/types'` augmentations — but `devframe` is the canonical import for both values and types.

## `devframe/utils/{promise,scope}` are removed

Two utility subpaths with no integration consumers are removed:

| Removed | Replacement |
|---------|-------------|
| `import { promiseWithResolver } from 'devframe/utils/promise'` | `Promise.withResolvers()` (native) |
| `import { isQualifiedName, qualifyName } from 'devframe/utils/scope'` | Inline the check (`name.includes(':')`) |

The other `devframe/utils/*` helpers — `colors`, `open`, `launch-editor`, `hash`, `nanoid`, `crypto-token`, `structured-clone`, `events`, `shared-state`, `streaming-channel`, `when`, `simple-schema`, `serve-static`, `agent-tool-name` — are unchanged.

## `devframe/node` is slimmed to the context surface

`devframe/node` keeps just the context-building API — `createHostContext` (+ `CreateHostContextOptions`), `createStorage` (+ `CreateStorageOptions`), and the `RpcFunctionsHost` type. Serve a devframe through the adapters (`createDevServer`, `createBuild`, `createCac`) or [`devframe/initiate`](../adapters/initiate); build a context to embed one with `createHostContext`.

The internal host implementations and low-level factories are no longer exported at all:

| Removed from `devframe/node` | Notes |
|---|---|
| `DevframeDiagnosticsHost`, `DevframeServicesHostImpl`, `DevframeViewHost` (classes) | Internal host implementations. The same-named **types** remain on `devframe/types`. |
| `createRpcSharedStateServerHost`, `createRpcStreamingServerHost` | Wired internally by `createContextRpcServer`. |
| `createScopedNodeContext`, `createNodeSettings` | Internal to context assembly. |
| `toDialableHost`, `formatHostForUrl`, `isObject` | Internal helpers (`isObject` is removed entirely — inline `typeof x === 'object' && x !== null`). |

## Cross-package internals move to `devframe/internal`

The low-level primitives shared between `devframe` and its first-party integrations (`@devframes/hub`, the inspect plugin, `@vitejs/devtools`, custom hosts) now live at the new `devframe/internal` entry point, which is explicitly **unstable** (it can change in any minor release). They were previously on `devframe/node`:

| Moved | From | To |
|---|---|---|
| `createH3DevframeHost` (+ `CreateH3DevframeHostOptions`) | `devframe/node` | `devframe/internal` |
| `startHttpAndWs` (+ `StartedServer`, `StartHttpAndWsOptions`) | `devframe/node` | `devframe/internal` |
| `createContextRpcServer` (+ `ContextRpcServer`, `CreateContextRpcServerOptions`) | `devframe/node` | `devframe/internal` |
| `DevframeAgentHost` (class) | `devframe/node` | `devframe/internal` |
| `coerceAgentPositionalArgs` (+ `AgentArgsFallback`) | `devframe/node` | `devframe/internal` |
| `registerDevframeInstance` / `listLiveDevframeInstances` (+ `DevframeInstanceRecord`, `DevframeInstanceRegistration`) | `devframe/node` | `devframe/internal` |
| `normalizeHttpServerUrl` | `devframe/node` | `devframe/internal` |

A host that stands up its own server composes from `devframe/internal` — `createH3DevframeHost` for the node `DevframeHost`, `startHttpAndWs` (or `createContextRpcServer` + `devframe/rpc/server` + `devframe/rpc/transports/*`) to bind a transport — plus `devframe/node`'s `createHostContext` and `devframe/node/hub-internals`. This is the path `@devframes/hub`'s `initHub` takes. A custom host advertises itself with `registerDevframeInstance`, and a devtool enumerates running instances with `listLiveDevframeInstances`. Application code should prefer the adapters and `devframe/initiate`.

## `@devframes/hub` category order lives only on `/constants`

`DEFAULT_CATEGORIES_ORDER` is now exported only from `@devframes/hub/constants` (its documented single source of truth). The redundant re-exports from `@devframes/hub`, `@devframes/hub/node`, and `@devframes/hub/client` are removed:

```ts
// 0.9
import { DEFAULT_CATEGORIES_ORDER } from '@devframes/hub/constants'
```
