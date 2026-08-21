---
outline: deep
---

# Migrating to 0.9

0.9 removes the compatibility shims deprecated across the 0.7 series and trims the public API of `devframe` and `@devframes/hub`. Each change has a drop-in replacement — update import paths and a few call sites.

Framework adapters (`@devframes/vite` / `@devframes/nuxt` / `@devframes/next`) each split into `.../single` (author one devframe's SPA) and `.../hub` (mount a whole `@devframes/hub`); the bare root throws with a pointer to both.

## `devframe/adapters/cli` is removed

The `devframe/adapters/cli` entry is gone; import from `devframe/adapters/cac`:

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

The typed-flag helpers `defineCliFlags` and `parseCliFlags` live on `devframe/adapters/cac` too.

## `devframe/recipes/open-helpers` is removed

Renamed to `common-rpc-functions` in 0.7.16. Import `commonRpcFunctions`:

```ts
// 0.8.x
import { openHelpers } from 'devframe/recipes/open-helpers'
```

```ts
// 0.9
import { commonRpcFunctions } from 'devframe/recipes/common-rpc-functions'
```

`openInEditor` and `openInFinder` are unchanged.

## RPC dump re-exports move to `devframe/rpc/dump`

The aliases re-exporting static-dump helpers from the `devframe/rpc` barrel are removed; import from `devframe/rpc/dump`:

```ts
// 0.8.x
import { createClientFromDump, dumpFunctions } from 'devframe/rpc'

// 0.9
import { createClientFromDump, dumpFunctions } from 'devframe/rpc/dump'
```

This covers every dump export: `collectStaticRpcDump`, `createClientFromDump`, `dumpFunctions`, `getDefinitionsWithDumps`, `reviveDumpError`, `serializeDumpError`, and the `StaticRpcDump*` types.

## `@devframes/hub` json-render shims are removed

json-render moved into the opt-in [`@devframes/json-render`](./json-render) integration in 0.7; the hub-local shims are now removed:

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

`createJsonRenderView` returns a view with a serializable `ref` (shared-state key or inline spec). Project it onto a hub dock via `toJsonRenderDockEntry` (`@devframes/json-render/hub`), which contributes the `'json-render'` dock type.

## `defineDevframe` moves to the package root

`defineDevframe` now lives on `devframe` alongside `defineRpcFunction`; `devframe/types` is now type-only. Import values and types from `devframe`:

| 0.8.x | 0.9 |
|-------|-----|
| `import { defineDevframe } from 'devframe/types'` | `import { defineDevframe } from 'devframe'` |
| `import type { DevframeNodeContext } from 'devframe/types'` | `import type { DevframeNodeContext } from 'devframe'` |

```ts
import type { DevframeNodeContext } from 'devframe'
// 0.9
import { defineDevframe, defineRpcFunction } from 'devframe'
```

## `devframe/utils/{promise,scope}` are removed

Two unused utility subpaths are removed:

| Removed | Replacement |
|---------|-------------|
| `import { promiseWithResolver } from 'devframe/utils/promise'` | `Promise.withResolvers()` (native) |
| `import { isQualifiedName, qualifyName } from 'devframe/utils/scope'` | Inline the check (`name.includes(':')`) |

## `devframe/node` is slimmed to the context surface

`devframe/node` keeps only the context API — `createHostContext`, `createStorage` (with their options types), and `RpcFunctionsHost`. Serve via the adapters or [`devframe/initiate`](../adapters/initiate).

Internal host implementations and low-level factories are no longer exported:

| Removed from `devframe/node` | Notes |
|---|---|
| `DevframeDiagnosticsHost`, `DevframeServicesHostImpl`, `DevframeViewHost` (classes) | Internal host implementations. The same-named **types** remain on `devframe/types`. |
| `createRpcSharedStateServerHost`, `createRpcStreamingServerHost` | Wired internally by `createContextRpcServer`. |
| `createScopedNodeContext`, `createNodeSettings` | Internal to context assembly. |
| `toDialableHost`, `formatHostForUrl`, `isObject` | Internal helpers (`isObject` is removed entirely - inline `typeof x === 'object' && x !== null`). |

## Cross-package internals move to `devframe/internal`

The low-level primitives shared between `devframe` and its integrations move from `devframe/node` to the new **unstable** `devframe/internal` entry point:

| Moved | From | To |
|---|---|---|
| `createH3DevframeHost` (+ `CreateH3DevframeHostOptions`) | `devframe/node` | `devframe/internal` |
| `StartedServer` (the `createDevServer` return handle) | `devframe/node` | `devframe/internal` |
| `DevframeAgentHost` (class) | `devframe/node` | `devframe/internal` |
| `coerceAgentPositionalArgs` (+ `AgentArgsFallback`) | `devframe/node` | `devframe/internal` |
| `registerDevframeInstance` / `listLiveDevframeInstances` (+ `DevframeInstanceRecord`, `DevframeInstanceRegistration`) | `devframe/node` | `devframe/internal` |
| `normalizeHttpServerUrl` | `devframe/node` | `devframe/internal` |

## `startHttpAndWs` is removed

The `startHttpAndWs` primitive is gone; `createDevServer`, `initDevframe`, and `initHub` own the binding internally. `StartHttpAndWsOptions` is removed; `StartedServer` stays (re-exported from `devframe/internal`).

| 0.8.x | 0.9 |
|---|---|
| `startHttpAndWs({ context, port, ... })` for a standalone tool | `createDevServer(def, { port, ... })` |
| `startHttpAndWs(...)` inside a framework host | `initDevframe(def, { base, ... })` / `initHub({ base, ... })` |

Bind your own transport with `createContextRpcServer` (`devframe/internal`) plus a transport from `devframe/rpc/transports/*`:

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

`mountDevframe(ctx, def, options)` becomes `ctx.install`; `MountDevframeOptions` is renamed `InstallDevframeOptions`. `initHub`'s `devframes` list runs the same path.

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

`DEFAULT_CATEGORIES_ORDER` now lives only on `@devframes/hub/constants`; the re-exports from `@devframes/hub`, `@devframes/hub/node`, and `@devframes/hub/client` are removed:

```ts
// 0.9
import { DEFAULT_CATEGORIES_ORDER } from '@devframes/hub/constants'
```

## The Vite bridge moves to `@devframes/vite`

`devframe/helpers/vite` is now its own package `@devframes/vite`. The single `viteDevBridge` becomes three purpose-named plugins on `@devframes/vite/single`:

| 0.8.x | 0.9 |
|---|---|
| `import { viteDevBridge } from 'devframe/helpers/vite'` | `import { devframeVite } from '@devframes/vite/single'` |
| `viteDevBridge(def)` (static mount) | `devframeVitePlugin(def)` |
| `viteDevBridge(def, { devMiddleware: true })` (RPC bridge) | `devframeViteBridge(def)` |
| `viteDevBridge(def, { devMiddleware: { port, host, flags } })` | `devframeViteBridge(def, { port, host, flags })` |

The `devMiddleware` option is gone: `devframeVitePlugin` is the static mount, `devframeViteBridge` the RPC bridge with options flattened to the top level (`port`, `host`, `flags`, `auth`, `mcp`). `devframeVite(def, { bridge })` picks between them.

```ts
// 0.8.x
import { viteDevBridge } from 'devframe/helpers/vite'

export default defineConfig({
  plugins: [viteDevBridge(devframe, { devMiddleware: true })],
})
```

```ts
// 0.9
import { devframeViteBridge } from '@devframes/vite/single'

export default defineConfig({
  plugins: [devframeViteBridge(devframe)],
})
```

`@devframes/vite` (and `@devframes/nuxt` / `@devframes/next`) take `@devframes/hub` and `@devframes/hub-ui` as **optional** peers — only the `/hub` scope needs them.

## Built-in plugins' `/vite` subpath is removed

Each plugin's `@devframes/plugin-<name>/vite` export is removed. For a Vite app, mount into [Vite DevTools](https://devtools.vite.dev) with `createPluginFromDevframe` (`@vitejs/devtools-kit/node`):

```ts
// 0.8.x
import { a11yVitePlugin } from '@devframes/plugin-a11y/vite'

export default defineConfig({
  plugins: [a11yVitePlugin()],
})
```

```ts
// 0.9
import createA11yDevframe from '@devframes/plugin-a11y'
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'

export default defineConfig({
  plugins: [createPluginFromDevframe(createA11yDevframe())],
})
```

Without Vite DevTools, call `devframeVite` against the plugin's default-export instance:

```ts
import createA11yDevframe from '@devframes/plugin-a11y'
import { devframeVite } from '@devframes/vite/single'

export default defineConfig({
  plugins: [devframeVite(createA11yDevframe())],
})
```

`codeServerVite` and `terminalsVite` are unaffected.

## Built-in plugins' default export is now the factory, not an instance

Every built-in plugin used to export a pre-built `DevframeDefinition` at module scope. The default export is now the `create<X>Devframe` factory; call it to get an instance:

```ts
// 0.8.x
import a11yDevframe from '@devframes/plugin-a11y'

await ctx.install(a11yDevframe)
```

```ts
// 0.9
import createA11yDevframe from '@devframes/plugin-a11y'

await ctx.install(createA11yDevframe())
```

## `@devframes/nuxt` and `@devframes/next` split into `/single` and `/hub`

Both now serve their single-devframe surface from `.../single`; the bare root throws with a pointer to the two scopes.

Nuxt — register the module by its subpath:

```ts
// 0.8.x [nuxt.config.ts]
export default defineNuxtConfig({ modules: ['@devframes/nuxt'] })

// 0.9 [nuxt.config.ts]
export default defineNuxtConfig({ modules: ['@devframes/nuxt/single'] })
```

Next — helpers and the React client move down a level:

| 0.8.x | 0.9 |
|---|---|
| `import { withDevframe } from '@devframes/next'` | `import { withDevframe } from '@devframes/next/single'` |
| `import { createDevframeNextHandler } from '@devframes/next'` | `import { createDevframeNextHandler } from '@devframes/next/single'` |
| `import { RpcProvider, useRpc } from '@devframes/next/client'` | `import { RpcProvider, useRpc } from '@devframes/next/single/client'` |

## Mounting a hub: the new `/hub` scope

`@devframes/vite/hub`, `@devframes/nuxt/hub`, and `@devframes/next/hub` mount a whole `@devframes/hub` without hand-rolled `initHub` glue. Each wraps `initHub` and defaults the UI to `@devframes/hub-ui`'s `createUi()` (override with `ui`, or `ui: false` for headless).

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

`@devframes/vite/hub` and `@devframes/nuxt/hub` print a one-time recommendation to prefer the native [Vite DevTools](https://devtools.vite.dev) / [Nuxt DevTools](https://devtools.nuxt.com) (silence with `{ quiet: true }`); `@devframes/next/hub` stays quiet.
