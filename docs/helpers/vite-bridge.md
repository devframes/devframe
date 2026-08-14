---
outline: deep
---

# @devframes/vite

Two Vite plugins for mounting a devframe inside an existing Vite dev server — `devframeVitePlugin` (static mount) and `devframeViteBridge` (RPC bridge) — plus `devframeVite`, a convenience wrapper that picks between them. Used by [`@devframes/nuxt`](./nuxt) and available for any Vite-based host (Astro, SolidStart, plain Vite apps).

This sits below the [`vite` adapter](/adapters/vite) on the abstraction ladder: the adapter targets the full Vite DevTools dock; these are the lower-level Vite plugins you reach for when you want a devframe to ride along with an existing app's dev server without the DevTools dock.

```ts
import { devframeViteBridge, devframeVitePlugin } from '@devframes/vite'
import { defineConfig } from 'vite'
import devframe from './devframe'

export default defineConfig({
  // Statically mounts the built SPA at `/__<id>/` — no RPC server:
  plugins: [devframeVitePlugin(devframe)],
  // Or bridge the RPC/WS backend into this dev server instead — the
  // host app owns the SPA:
  // plugins: [devframeViteBridge(devframe)],
})
```

## `devframeVitePlugin` — static mount

Mounts `def.cli.distDir` at `options.base` (`/__<id>/` by default) with SPA fallback. No RPC server is started — useful when you only need the SPA bundle served from a known path.

| Option | Default | Description |
|--------|---------|-------------|
| `base` | `def.basePath ?? '/__<id>/'` | Mount path inside the Vite dev server. |

## `devframeViteBridge` — RPC bridge

Skips the static mount — the host app owns the SPA. Devframe spawns a separate RPC + WS server and registers Vite middleware at `<base>__connection.json` so the host-served SPA can discover the WS endpoint. The side-car listens on its own port unless it can share Vite's own HTTP server, so the descriptor carries that port alongside the `/__ws` route.

To mount the RPC socket onto the Vite server's own port instead of a side-car — so it shares the origin with the app and rides through a proxy — pass Vite's HTTP server to [`initDevframe`](/adapters/initiate) / `initHub` via the `server` option. Devframe binds only its own `<base>__ws` upgrade route and leaves the rest (Vite's HMR socket included) untouched.

| Option | Default | Description |
|--------|---------|-------------|
| `base` | `def.basePath ?? '/__<id>/'` | Mount path inside the Vite dev server. |
| `port` | share Vite's HTTP server | Pin a side-car port for the RPC socket instead. |
| `host` | `def.cli?.host ?? 'localhost'` | Bind host for a pinned side-car. |
| `flags` | — | Forwarded to `def.setup(ctx, { flags })`. |
| `auth` | gated (interactive OTP) | `false` to opt out for a single-user localhost host, or a `DevframeAuthHandler` for a custom scheme. |
| `mcp` | `def.cli?.mcp` | `true` or `McpRouteOptions` to expose the route-based MCP server at `<base>__mcp`. |

`port` / `host` / `flags` mirror [`createDevServer`](/adapters/dev)'s options of the same name.

## `devframeVite` — convenience wrapper

`devframeVite(def, { bridge, ...bridgeOptions })` forwards to `devframeViteBridge` when `bridge: true`, or `devframeVitePlugin` otherwise — handy when a single call site needs to switch between the two modes. Reach for the two plugins directly when a devframe needs both mounted at once (e.g. a bridge for RPC alongside a static mount serving its own bundled UI, as the built-in `terminals`/`code-server` plugins do).
