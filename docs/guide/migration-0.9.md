---
outline: deep
---

# Migrating to 0.9

0.9 removes the compatibility shims that were deprecated across the 0.7 series and trims the public API surface of `devframe` and `@devframes/hub` down to what integrations actually consume. Each change has a drop-in replacement, so migrating is a matter of updating import paths and a handful of call sites. This page covers the changes between 0.8.x and 0.9.

## Overview

Every entry below has a drop-in replacement. At a glance:

**`devframe`**

| Removed / moved | Replacement |
|---|---|
| `devframe/adapters/cli` (`createCli`, `CreateCliOptions`, `CliHandle`) | `devframe/adapters/cac` (`createCac`, …) |
| `devframe/recipes/open-helpers` | `devframe/recipes/common-rpc-functions` |
| dump re-exports on the `devframe/rpc` barrel | `devframe/rpc/dump` |
| `defineDevframe` on `devframe/types` | `defineDevframe` on `devframe` |
| `devframe/utils/promise`, `devframe/utils/scope` | `Promise.withResolvers()` / inline the check |
| host implementations + low-level factories on `devframe/node` | slimmed to `createHostContext` / `createStorage` |
| cross-package internals on `devframe/node` | `devframe/internal` (unstable) |
| `startHttpAndWs` | `createDevServer` / `devframe/initiate` |

**`@devframes/hub`**

| Removed / moved | Replacement |
|---|---|
| json-render shims (`defineJsonRenderSpec`, `ctx.createJsonRenderer`, …) | `@devframes/json-render` |
| `mountDevframe` | `ctx.install` |
| `DEFAULT_CATEGORIES_ORDER` re-exports | `@devframes/hub/constants` |

**Framework adapters (`@devframes/vite` / `@devframes/nuxt` / `@devframes/next`)**

Each splits into two scoped subpaths — `.../dev-spa` (author one devframe's SPA) and `.../hub` (mount a whole `@devframes/hub`) — and the bare package root throws with a pointer to both.

| Removed / moved | Replacement |
|---|---|
| `devframe/helpers/vite` (`viteDevBridge`) | `@devframes/vite/dev-spa` (`devframeVite` / `devframeVitePlugin` / `devframeViteBridge`) |
| `@devframes/nuxt` (bare module) | `@devframes/nuxt/dev-spa` |
| `@devframes/next` root (`withDevframe`, `createDevframeNextHandler`) | `@devframes/next/dev-spa` |
| `@devframes/next/client` | `@devframes/next/dev-spa/client` |
| mount a hub inside a tool | `@devframes/{vite,nuxt,next}/hub` (+ `/hub/client`) |

**Built-in plugins**

| Removed / moved | Replacement |
|---|---|
| `@devframes/plugin-{a11y,assets,data-inspector,inspect,messages,og}/vite` | `devframeVite(def, options)` from `@devframes/vite/dev-spa`, against the plugin's default export |

## `devframe/adapters/cli` is removed

The CLI adapter was renamed to `cac` in 0.7. The `devframe/adapters/cli` entry - `createCli`, `CreateCliOptions`, and `CliHandle` - is now gone. Import from `devframe/adapters/cac` instead:

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

This applies to every dump export - `collectStaticRpcDump`, `createClientFromDump`, `dumpFunctions`, `getDefinitionsWithDumps`, `reviveDumpError`, `serializeDumpError`, and the `StaticRpcDump*` types.

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

`createJsonRenderView` returns a view carrying a serializable `ref` (a shared-state key or an inline spec). Project it onto a hub dock with `toJsonRenderDockEntry` from `@devframes/json-render/hub`, which contributes the `'json-render'` dock type to the hub's open dock union. A dock entry now carries that serializable `view` ref rather than a live renderer handle - a client reads `entry.view.stateKey` (or `entry.view.spec`) to render it.

See [JSON-Render](./json-render) for the full integration reference.

## `defineDevframe` moves to the package root

`defineDevframe` - the primary authoring helper - now lives on the `devframe` entry point alongside `defineRpcFunction`. `devframe/types` is now strictly type-only. Import both values and types from `devframe`:

| 0.8.x | 0.9 |
|-------|-----|
| `import { defineDevframe } from 'devframe/types'` | `import { defineDevframe } from 'devframe'` |
| `import type { DevframeNodeContext } from 'devframe/types'` | `import type { DevframeNodeContext } from 'devframe'` |

```ts
import type { DevframeNodeContext } from 'devframe'
// 0.9
import { defineDevframe, defineRpcFunction } from 'devframe'
```

`devframe/types` still resolves as the type-only subpath - useful for `declare module 'devframe/types'` augmentations - but `devframe` is the canonical import for both values and types.

## `devframe/utils/{promise,scope}` are removed

Two utility subpaths with no integration consumers are removed:

| Removed | Replacement |
|---------|-------------|
| `import { promiseWithResolver } from 'devframe/utils/promise'` | `Promise.withResolvers()` (native) |
| `import { isQualifiedName, qualifyName } from 'devframe/utils/scope'` | Inline the check (`name.includes(':')`) |

The other `devframe/utils/*` helpers - `colors`, `open`, `launch-editor`, `hash`, `nanoid`, `crypto-token`, `structured-clone`, `events`, `shared-state`, `streaming-channel`, `when`, `simple-schema`, `serve-static`, `agent-tool-name` - are unchanged.

## `devframe/node` is slimmed to the context surface

`devframe/node` keeps just the context-building API - `createHostContext` (+ `CreateHostContextOptions`), `createStorage` (+ `CreateStorageOptions`), and the `RpcFunctionsHost` type. Serve a devframe through the adapters (`createDevServer`, `createBuild`, `createCac`) or [`devframe/initiate`](../adapters/initiate); build a context to embed one with `createHostContext`.

The internal host implementations and low-level factories are no longer exported at all:

| Removed from `devframe/node` | Notes |
|---|---|
| `DevframeDiagnosticsHost`, `DevframeServicesHostImpl`, `DevframeViewHost` (classes) | Internal host implementations. The same-named **types** remain on `devframe/types`. |
| `createRpcSharedStateServerHost`, `createRpcStreamingServerHost` | Wired internally by `createContextRpcServer`. |
| `createScopedNodeContext`, `createNodeSettings` | Internal to context assembly. |
| `toDialableHost`, `formatHostForUrl`, `isObject` | Internal helpers (`isObject` is removed entirely - inline `typeof x === 'object' && x !== null`). |

## Cross-package internals move to `devframe/internal`

The low-level primitives shared between `devframe` and its first-party integrations (`@devframes/hub`, the inspect plugin, `@vitejs/devtools`, custom hosts) now live at the new `devframe/internal` entry point, which is explicitly **unstable** (it can change in any minor release). They were previously on `devframe/node`:

| Moved | From | To |
|---|---|---|
| `createH3DevframeHost` (+ `CreateH3DevframeHostOptions`) | `devframe/node` | `devframe/internal` |
| `StartedServer` (the `createDevServer` return handle) | `devframe/node` | `devframe/internal` |
| `DevframeAgentHost` (class) | `devframe/node` | `devframe/internal` |
| `coerceAgentPositionalArgs` (+ `AgentArgsFallback`) | `devframe/node` | `devframe/internal` |
| `registerDevframeInstance` / `listLiveDevframeInstances` (+ `DevframeInstanceRecord`, `DevframeInstanceRegistration`) | `devframe/node` | `devframe/internal` |
| `normalizeHttpServerUrl` | `devframe/node` | `devframe/internal` |

A host that stands up its own server composes from `devframe/internal` - `createH3DevframeHost` for the node `DevframeHost`, plus `createContextRpcServer` and a transport from `devframe/rpc/transports/*` to bind the RPC socket - alongside `devframe/node`'s `createHostContext` and `devframe/node/hub-internals`. A custom host advertises itself with `registerDevframeInstance`, and a devtool enumerates running instances with `listLiveDevframeInstances`. Application code should prefer the adapters and `devframe/initiate`.

## `startHttpAndWs` is removed

The low-level "listen on a port + attach the WS transport" primitive is gone. `createDevServer`, `initDevframe`, and `initHub` own that binding internally now, resolving the transport from their own `server` / `ws` options - so the common paths never touch it. `StartHttpAndWsOptions` is removed with it; `StartedServer` stays (it is still `createDevServer`'s return handle, re-exported from `devframe/internal`).

| 0.8.x | 0.9 |
|---|---|
| `startHttpAndWs({ context, port, ... })` for a standalone tool | `createDevServer(def, { port, ... })` |
| `startHttpAndWs(...)` inside a framework host | `initDevframe(def, { base, ... })` / `initHub({ base, ... })` |

A host that genuinely binds its own transport - a bare RPC socket, or a server it wires itself - composes the two primitives the adapters use underneath: `createContextRpcServer` (`devframe/internal`) for the session/auth wiring, and a transport from `devframe/rpc/transports/*`.

```ts
// 0.9 - bind the RPC socket onto a server you own
import { createServer } from 'node:http'
import { createContextRpcServer } from 'devframe/internal'
import { attachWsRpcTransport } from 'devframe/rpc/transports/ws-server'

const httpServer = createServer()
const { rpcGroup, onConnected, onDisconnected } = createContextRpcServer({ context, auth: false })
attachWsRpcTransport(rpcGroup, { server: httpServer, onConnected, onDisconnected })
httpServer.listen(port)
```

## `@devframes/hub`'s `mountDevframe` is removed - use `ctx.install`

The free `mountDevframe(ctx, def, options)` function is replaced by an `install` method on the hub context. `MountDevframeOptions` is renamed `InstallDevframeOptions`. `initHub`'s declarative `devframes` list runs the same install path under the hood, so most hosts never call it directly.

| 0.8.x | 0.9 |
|---|---|
| `import { mountDevframe } from '@devframes/hub/node'` | removed - call `ctx.install` |
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

## The Vite bridge moves to `@devframes/vite`

`devframe/helpers/vite` is now its own package, `@devframes/vite` — so it can depend on `vite` directly (its plugins are typed against Vite's real `Plugin` / `ViteDevServer`) while `devframe` core stays free of a Vite dependency. It also splits into two scoped subpaths, and the single `viteDevBridge` becomes three purpose-named plugins on `@devframes/vite/dev-spa`:

| 0.8.x | 0.9 |
|---|---|
| `import { viteDevBridge } from 'devframe/helpers/vite'` | `import { devframeVite } from '@devframes/vite/dev-spa'` |
| `viteDevBridge(def)` (static mount) | `devframeVitePlugin(def)` |
| `viteDevBridge(def, { devMiddleware: true })` (RPC bridge) | `devframeViteBridge(def)` |
| `viteDevBridge(def, { devMiddleware: { port, host, flags } })` | `devframeViteBridge(def, { port, host, flags })` |

The `devMiddleware` boolean/object option is gone: `devframeVitePlugin` is always the static mount, `devframeViteBridge` is always the RPC bridge, and their bridge options are flattened to the top level (`port`, `host`, `flags`, `auth`, `mcp`). `devframeVite(def, { bridge })` is a convenience wrapper that picks between the two.

```ts
// 0.8.x
import { viteDevBridge } from 'devframe/helpers/vite'

export default defineConfig({
  plugins: [viteDevBridge(devframe, { devMiddleware: true })],
})
```

```ts
// 0.9
import { devframeViteBridge } from '@devframes/vite/dev-spa'

export default defineConfig({
  plugins: [devframeViteBridge(devframe)],
})
```

`@devframes/vite` (and `@devframes/nuxt` / `@devframes/next`) take `@devframes/hub` and `@devframes/hub-ui` as **optional** peers — only the `/hub` scope needs them. Install `vite` as a peer as before. See [`@devframes/vite`](/frameworks/vite) for the full reference.

## Built-in plugins' `/vite` subpath is removed

`a11yVitePlugin`, `assetsVitePlugin`, `dataInspectorVitePlugin`, `inspectVitePlugin`, `messagesVitePlugin`, and `ogVitePlugin` — each plugin's `@devframes/plugin-<name>/vite` export — were one-line renames over `devframeVite(def, options)`. For a Vite app, mount the plugin into [Vite DevTools](https://devtools.vite.dev) instead, with `createPluginFromDevframe` from `@vitejs/devtools-kit/node`:

```ts
// 0.8.x
import { a11yVitePlugin } from '@devframes/plugin-a11y/vite'

export default defineConfig({
  plugins: [a11yVitePlugin()],
})
```

```ts
// 0.9
import a11yDevframe from '@devframes/plugin-a11y'
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'

export default defineConfig({
  plugins: [createPluginFromDevframe(a11yDevframe)],
})
```

Without Vite DevTools, call `devframeVite` directly against the plugin's default export instead — the lower-level, DevTools-free path:

```ts
import a11yDevframe from '@devframes/plugin-a11y'
import { devframeVite } from '@devframes/vite/dev-spa'

export default defineConfig({
  plugins: [devframeVite(a11yDevframe)],
})
```

`@devframes/plugin-code-server`'s `codeServerVite` and `@devframes/plugin-terminals`'s `terminalsVite` are unaffected — they mount a bridge and a static plugin together (and build their devframe from the passed options), not a plain `devframeVite` delegation.

## `@devframes/nuxt` and `@devframes/next` split into `/dev-spa` and `/hub`

Both packages now serve their single-devframe surface from a `.../dev-spa` subpath, and the bare package root throws with a pointer to the two scopes.

Nuxt — register the module by its subpath:

```ts
// 0.8.x [nuxt.config.ts]
export default defineNuxtConfig({ modules: ['@devframes/nuxt'] })

// 0.9 [nuxt.config.ts]
export default defineNuxtConfig({ modules: ['@devframes/nuxt/dev-spa'] })
```

Next — the config/handler helpers and the React client move down a level:

| 0.8.x | 0.9 |
|---|---|
| `import { withDevframe } from '@devframes/next'` | `import { withDevframe } from '@devframes/next/dev-spa'` |
| `import { createDevframeNextHandler } from '@devframes/next'` | `import { createDevframeNextHandler } from '@devframes/next/dev-spa'` |
| `import { RpcProvider, useRpc } from '@devframes/next/client'` | `import { RpcProvider, useRpc } from '@devframes/next/dev-spa/client'` |

## Mounting a hub: the new `/hub` scope

Standing up a whole `@devframes/hub` (many integrations) inside a tool now has a first-class home instead of hand-rolled `initHub` glue: `@devframes/vite/hub`, `@devframes/nuxt/hub`, and `@devframes/next/hub`. Each wraps `initHub`, defaults the UI slot to `@devframes/hub-ui`'s `createUi()` (override with `ui`, or `ui: false` for a headless hub you drive with the matching `/hub/client` helper), and mounts everything under one namespace.

```ts
// Vite
import { viteDevframeHub } from '@devframes/vite/hub'

export default defineConfig({ plugins: [viteDevframeHub({ devframes: [] })] })
```

```ts
// Next — app/__devframes/[[...path]]/route.ts
import { nextDevframeHub } from '@devframes/next/hub'

export const runtime = 'nodejs'
const hub = nextDevframeHub({ devframes: [] })
export const GET = (req: Request) => hub.handler(req)
export const POST = (req: Request) => hub.handler(req)
export const DELETE = (req: Request) => hub.handler(req)
```

Vite and Nuxt already have native hub viewers, so `@devframes/vite/hub` and `@devframes/nuxt/hub` print a one-time recommendation to prefer [Vite DevTools](https://devtools.vite.dev) / [Nuxt DevTools](https://devtools.nuxt.com) (silence with `{ quiet: true }`); `@devframes/next/hub` has no native counterpart and stays quiet. See [`@devframes/vite`](/frameworks/vite#mounting-a-hub), [`@devframes/nuxt`](/frameworks/nuxt#mounting-a-hub), and [`@devframes/next`](/frameworks/next#mounting-a-hub).
