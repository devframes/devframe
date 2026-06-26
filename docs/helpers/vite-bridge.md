---
outline: deep
---

# Vite Bridge

A thin Vite plugin for mounting a devframe inside an existing Vite dev server. Used by [`@devframes/nuxt`](./nuxt) and available for any Vite-based host (Astro, SolidStart, plain Vite apps).

This sits below the [`vite` adapter](/adapters/vite) on the abstraction ladder: the adapter targets the full Vite DevTools dock; the bridge is the lower-level Vite plugin you reach for when you want a devframe to ride along with an existing app's dev server without the DevTools dock.

```ts
import { viteDevBridge } from 'devframe/helpers/vite'
import { defineConfig } from 'vite'
import devframe from './devframe'

export default defineConfig({
  plugins: [viteDevBridge(devframe)],
})
```

## Modes

- **Static mount** (default) — mounts `def.cli.distDir` at `options.base` (`/__<id>/` by default). No RPC server. Useful when you only need the SPA bundle served from a known path.
- **Bridge mode** (`devMiddleware: true | {…}`) — skips the static mount; the host app owns the SPA. Devframe spawns a separate RPC + WS server and registers Vite middleware at `<base>__connection.json` so the host-served SPA can discover the WS endpoint. The side-car listens on its own port, so the descriptor carries that port alongside the `/__devframe_ws` route.

To mount the RPC socket onto the Vite server's own port instead of a side-car — so it shares the origin with the app and rides through a proxy — pass an existing HTTP server and a route to [`startHttpAndWs`](/adapters/dev) via its `server` and `path` options. Devframe routes only that upgrade path and leaves the rest (Vite's HMR socket included) untouched.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `base` | `def.basePath ?? '/__<id>/'` | Mount path inside the Vite dev server. |
| `devMiddleware` | `false` | `true` or `{ port?, host?, flags? }` to enable bridge mode. |

When `devMiddleware` is an object, the inner fields mirror [`createDevServer`](/adapters/dev) — `port` pins the WS server port, `host` sets the bind host, and `flags` is forwarded to `def.setup(ctx, { flags })`.
