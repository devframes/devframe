---
outline: deep
---

# Vite

`@devframes/vite` splits into **`@devframes/vite/single`** (dev-serve one devframe's SPA) and [**`@devframes/vite/hub`**](#mounting-a-hub) (mount a whole devframes-hub); the bare import throws.

The `single` scope exports `devframeVitePlugin`, `devframeViteBridge`, and `devframeVite`; also used by [`@devframes/nuxt`](./nuxt).

```ts
import { devframeViteBridge, devframeVitePlugin } from '@devframes/vite/single'
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

Mounts `def.clientAssets` at `options.base` (`/__<id>/` default) with SPA fallback; no RPC server. `clientAssets` accepts a local directory or [remote assets](/guide/client-assets).

| Option | Default | Description |
|--------|---------|-------------|
| `base` | `def.basePath ?? '/__<id>/'` | Mount path inside the Vite dev server. |

## `devframeViteBridge` — RPC bridge

The host app owns the SPA; devframe spawns a separate RPC + WS server and registers Vite middleware at `<base>__connection.json`. To share the Vite server's port instead of a side-car, pass its HTTP server to [`initDevframe`](/adapters/initiate) / `initHub` via `server`.

| Option | Default | Description |
|--------|---------|-------------|
| `base` | `def.basePath ?? '/__<id>/'` | Mount path inside the Vite dev server. |
| `port` | share Vite's HTTP server | Pin a side-car port for the RPC socket instead. |
| `host` | `def.cli?.host ?? 'localhost'` | Bind host for a pinned side-car. |
| `flags` | — | Forwarded to `def.setup(ctx, { flags })`. |
| `auth` | gated (interactive OTP) | `false` to opt out, or a `DevframeAuthHandler` for a custom scheme. |
| `mcp` | `def.cli?.mcp` | `true` or `McpRouteOptions` to expose the route-based MCP server at `<base>__mcp`. |

## `devframeVite` — convenience wrapper

`devframeVite(def, { bridge, ...opts })` forwards to `devframeViteBridge` when `bridge: true`, else `devframeVitePlugin` — use them directly when a devframe needs both (as `terminals`/`code-server` do).

## Mounting a hub

`@devframes/vite/hub` mounts a [devframes-hub](/guide/hub) with one `viteDevframeHub()` plugin: wraps `initHub`, shares Vite's HTTP server, defaults dock UI to `@devframes/hub-ui`.


```ts
import { viteDevframeHub } from '@devframes/vite/hub'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [viteDevframeHub({ devframes: [] })],
})
```

Pass `ui` to swap the viewer or `ui: false` for headless (via `@devframes/vite/hub/client`'s `mountDevframeHubClient()`). Vite DevTools (`@vitejs/devtools-kit`) supports this natively, so the plugin recommends it once (`{ quiet: true }` to silence).
