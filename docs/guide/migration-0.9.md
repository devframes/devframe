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
| `createContextRpcServer` (+ `ContextRpcServer`, `CreateContextRpcServerOptions`) | `devframe/node` | `devframe/internal` |
| `StartedServer` (the `createDevServer` return handle) | `devframe/node` | `devframe/internal` |
| `DevframeAgentHost` (class) | `devframe/node` | `devframe/internal` |
| `coerceAgentPositionalArgs` (+ `AgentArgsFallback`) | `devframe/node` | `devframe/internal` |
| `registerDevframeInstance` / `listLiveDevframeInstances` (+ `DevframeInstanceRecord`, `DevframeInstanceRegistration`) | `devframe/node` | `devframe/internal` |
| `normalizeHttpServerUrl` | `devframe/node` | `devframe/internal` |

A host that stands up its own server composes from `devframe/internal` — `createH3DevframeHost` for the node `DevframeHost`, `createContextRpcServer` + `devframe/rpc/transports/*` to bind a transport — plus `devframe/node`'s `createHostContext` and `devframe/node/hub-internals`. This is the path `@devframes/hub`'s `initHub` takes. A custom host advertises itself with `registerDevframeInstance` (or the new `register` flag, below), and a devtool enumerates running instances with `listLiveDevframeInstances`. Application code should prefer the adapters and `devframe/initiate`.

## `startHttpAndWs` is removed

The low-level "listen on a port + attach the WS transport" primitive is gone. `createDevServer`, `initDevframe`, and `initHub` own that binding internally now, resolving the transport from their own `server` / `ws` options — so the common paths never touch it. `StartHttpAndWsOptions` is removed with it; `StartedServer` stays (it is still `createDevServer`'s return handle, re-exported from `devframe/internal`).

| 0.8.x | 0.9 |
|---|---|
| `startHttpAndWs({ context, port, ... })` for a standalone tool | `createDevServer(def, { port, ... })` |
| `startHttpAndWs(...)` inside a framework host | `initDevframe(def, { base, ... })` / `initHub({ base, ... })` |

A host that genuinely binds its own transport — a bare RPC socket, or a server it wires itself — composes the two public primitives `startHttpAndWs` used underneath: `createContextRpcServer` (`devframe/internal`) for the session/auth wiring, and a transport from `devframe/rpc/transports/*`.

```ts
// 0.9 — bind the RPC socket onto a server you own
import { createServer } from 'node:http'
import { createContextRpcServer } from 'devframe/internal'
import { attachWsRpcTransport } from 'devframe/rpc/transports/ws-server'

const httpServer = createServer()
const { rpcGroup, onConnected, onDisconnected } = createContextRpcServer({ context, auth: false })
attachWsRpcTransport(rpcGroup, { server: httpServer, onConnected, onDisconnected })
httpServer.listen(port)
```

## `@devframes/hub`'s `mountDevframe` is removed — use `ctx.install`

The free `mountDevframe(ctx, def, options)` function is replaced by an `install` method on the hub context. `MountDevframeOptions` is renamed `InstallDevframeOptions`. `initHub`'s declarative `devframes` list runs the same install path under the hood, so most hosts never call it directly.

| 0.8.x | 0.9 |
|---|---|
| `import { mountDevframe } from '@devframes/hub/node'` | removed — call `ctx.install` |
| `await mountDevframe(ctx, def, opts)` | `await ctx.install(def, opts)` |
| `MountDevframeOptions` | `InstallDevframeOptions` (from `@devframes/hub/node`) |

```ts
// 0.8.x
import { createHubContext, mountDevframe } from '@devframes/hub/node'

const ctx = await createHubContext({ host, cwd, mode: 'dev' })
await mountDevframe(ctx, myDevframe)
```

```ts
// 0.9
import { createHubContext } from '@devframes/hub/node'

const ctx = await createHubContext({ host, cwd, mode: 'dev' })
await ctx.install(myDevframe)
```

## `@devframes/hub` category order lives only on `/constants`

`DEFAULT_CATEGORIES_ORDER` is now exported only from `@devframes/hub/constants` (its documented single source of truth). The redundant re-exports from `@devframes/hub`, `@devframes/hub/node`, and `@devframes/hub/client` are removed:

```ts
// 0.9
import { DEFAULT_CATEGORIES_ORDER } from '@devframes/hub/constants'
```

## `initDevframe` / `initHub` bind no WebSocket server on their own

Both factories used to start a side-car WebSocket server when no transport option was given. In 0.9 a side-car is opt-in, so creating an instance never binds a port by itself. The binding resolves `ws.port` > `server` > `ws.sidecar` > the host's own upgrades:

| 0.8.x | 0.9 |
|-------|-----|
| `initHub({ base })` (implicit side-car) | `initHub({ base, ws: { sidecar: true } })` |
| `initDevframe(def, { base })` (implicit side-car) | `initDevframe(def, { base, ws: { sidecar: true } })` |
| — | `hub.attach(server)` / `hub.handleUpgrade(req, socket, head)` — serve the socket from a server the host owns |

Hosts already passing `server`, `ws.port` or `ws.url` are unaffected. Hosts whose handlers never see upgrades (Next.js route handlers, Nitro, Rsbuild) add `ws: { sidecar: true }`; hosts that get their `node:http` server *after* the instance exists — a Hono app served by `@hono/node-server`, for instance — hand it over with `attach`, which returns a detach function:

```ts
// 0.9
import { serve } from '@hono/node-server'

const hub = initHub({ base: DEVFRAMES_HUB_BASE })
const detach = hub.attach(serve({ fetch: app.fetch, port: 3000 }))
```

Calling `attach` / `handleUpgrade` on an instance that already owns a transport reports [`DF0055`](/errors/DF0055), and on the advertise-only `ws.url` tier [`DF0056`](/errors/DF0056).

## `initDevframe` / `initHub` can register themselves

An in-process host used to call `registerDevframeInstance` by hand to appear in the global instance registry (`~/.devframe/instances/`, read by `devframe connect` and the inspect plugin's Instances tab). Both factories now take an opt-in `register` flag that does it for them: a dynamic import that writes the record once the public origin resolves and removes it on `close()`. `createDevServer` registers this way automatically.

| 0.8.x | 0.9 |
|---|---|
| manual `registerDevframeInstance({ pid, port, origin, … })` + `unregister()` on every close path | `initHub({ base, register: true })` / `initDevframe(def, { base, register: true })` |

Pass an object to override individual record fields — `register: { id, name, rootDir }`. `registerDevframeInstance` / `listLiveDevframeInstances` remain on `devframe/internal` for hosts that drive the registry directly.

## The `key` option is removed; memoize on `globalThis`

`initDevframe` and `initHub` no longer memoize instances under a `key` (and the `DF0053` / `DF8001` replacement diagnostics are gone with it). A host that re-evaluates its modules in dev owns the memo, which makes the lifecycle visible at the call site:

```ts
// 0.8.x
export const hub = initHub({ key: 'devtools', base: DEVFRAMES_HUB_BASE, devframes })
```

```ts
// 0.9
const g = globalThis as { hub?: HubInstance }
export const hub = g.hub ??= initHub({ base: DEVFRAMES_HUB_BASE, devframes })
```

`@devframes/next`'s `createDevframeNextHandler` keeps its own `key` option and memoizes for you, so Next hosts using it need no change.

## The Bun WebSocket tier moves out of the instances

`initDevframe` / `initHub` no longer detect Bun and complete fetch upgrades themselves, so `instance.websocket` and `handler`'s second (`server`) argument are gone — `handler` is now exactly `(request: Request) => Promise<Response>`. A Bun host binds the transport itself, with the same public primitives the instances used underneath:

```ts
// 0.9
import { createContextRpcServer } from 'devframe/internal'
import { attachBunWsTransport } from 'devframe/rpc/transports/ws-bun'

const core = createContextRpcServer({ context: await hub.context, auth: false })
const tier = await attachBunWsTransport(core)

Bun.serve({
  port: 3000,
  fetch(request, server) {
    const { pathname } = new URL(request.url)
    if (pathname === `${hub.base}__ws` && request.headers.get('upgrade')?.toLowerCase() === 'websocket')
      return tier.handleUpgrade(request, server)
    return app.fetch(request)
  },
  websocket: tier.websocket as never,
})
```

`examples/hub-hono-minimal` ships this wiring in [`src/bun.ts`](https://github.com/devframes/devframe/blob/main/examples/hub-hono-minimal/src/bun.ts), next to the Node entry's `hub.attach(server)`.

## `renderers.mount()` resolves a typed result

The client renderer registry's `mount()` previously resolved a bare disposer — and silently no-opped when no renderer covered the dock type. It now resolves a discriminated `DockRendererMountResult`, so viewers can show a visible fallback instead of a dead panel:

```ts
// 0.8.x
const dispose = await context.renderers.mount(entry, container)

// 0.9
const result = await context.renderers.mount(entry, container)
if (result.status === 'mounted')
  const dispose = result.dispose
else if (result.status === 'missing-renderer')
  showFallback(`No renderer for "${entry.type}" in the current environment`)
else // 'load-error'
  showError(result.error)
```

`renderers.has(type)` now also answers `true` for types covered by the hub's [renderer manifest](./hub-initiate#renderer-modules) (`initHub({ renderers })`), whose modules `mount()` imports lazily; renderers registered locally keep precedence.

## `@devframes/hub-ui` renders json-render docks through the registry

hub-ui's bundled Vue json-render components are removed. A `json-render` dock (and any other non-native dock type) now renders through the dock-renderer registry — compose a frontend on the hub:

```ts
// 0.9
import { createUi } from '@devframes/hub-ui'
import { jsonRenderUiRenderer } from '@devframes/json-render-ui/hub'

initHub({ ui: createUi(), renderers: [jsonRenderUiRenderer()] })
```

Without a registration for the type, hub-ui shows its missing-renderer fallback view. Behavior also improves with the reference module: prop validation with per-element error isolation, action error surfacing, and static-mode handling — see [JSON-Render](./json-render#rendering-inside-a-hub).
