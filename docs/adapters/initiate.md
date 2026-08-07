# Initiate (standard middleware)

Serve a devframe from inside any app that can mount a catch-all route: `initDevframe(def, { base })` returns a live instance whose `.handler` — a web-standard `(request: Request) => Promise<Response>` — carries the whole surface (the SPA, `__connection.json` discovery, the WebSocket RPC endpoint, the auth gate, and the optional MCP route) under one mount base.

```ts
import { initDevframe } from 'devframe/initiate'
import myDevframe from './devframe'

const devtools = initDevframe(myDevframe, { base: '/__my-tool/', key: 'my-tool' })
// devtools.base, devtools.handler, devtools.nodeMiddleware, devtools.websocket,
// devtools.ready, devtools.context, devtools.connectionMeta(), devtools.close()
```

`base` is required, so the mount path is explicit at the call site — pass the conventional `resolveBasePath(def, 'hosted')` (i.e. `def.basePath ?? /__<id>/`) if you don't want to pick one. The instance echoes the normalized value back as `devtools.base`, so route guards and middleware reference it instead of repeating the string. The factory is synchronous and initializes eagerly; `handler`/`nodeMiddleware` await readiness internally, so hosts never race the boot.

## Mount the handler

::: code-group

```ts [Vite]
import { initDevframe } from 'devframe/initiate'
// vite.config.ts — connect-style middleware + Vite's own server for the socket
import { defineConfig } from 'vite'
import myDevframe from './devframe'

export default defineConfig({
  plugins: [{
    name: 'my-tool',
    apply: 'serve',
    configureServer(server) {
      const devtools = initDevframe(myDevframe, {
        base: '/__my-tool/',
        key: 'my-tool',
        server: server.httpServer ?? undefined,
      })
      server.middlewares.use(devtools.nodeMiddleware)
    },
  }],
})
```

```ts [Nitro]
// routes/__my-tool/[...path].ts — plus routes/__my-tool/index.ts (same body)
// for the namespace root, since a catch-all doesn't match its own empty path.
import { defineHandler } from 'nitro'
import { devtools } from '../../devtools'

export default defineHandler(event => devtools.handler(event.req))
```

```ts [Hono]
// server.ts — the same file runs on Node and Bun
import { Hono } from 'hono'
import { devtools } from './devtools'

const app = new Hono()
app.all('/__my-tool/*', c => devtools.handler(c.req.raw, c.env))
```

```ts [Next.js]
import { initDevframe } from 'devframe/initiate'
// app/%5F_my-tool/[[...path]]/route.ts — Next reserves `_`-prefixed
// folders, so the segment is URL-encoded (`%5F_` decodes to `__`).
import myDevframe from '@/devframe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const devtools = initDevframe(myDevframe, { base: '/__my-tool/', key: 'my-tool' })
export const GET = devtools.handler
```

```ts [Nuxt]
// server/middleware/devtools.ts
import { devtools } from '../devtools'

export default defineEventHandler((event) => {
  const { pathname } = new URL(toWebRequest(event).url)
  // `devtools.base` is the normalized mount base — no repeated string.
  if (pathname.startsWith(devtools.base) || pathname === devtools.base.slice(0, -1))
    return devtools.handler(toWebRequest(event))
})
```

```ts [SvelteKit]
// src/routes/%5F_my-tool/[...path]/+server.ts
import myDevframe from '$lib/devframe'
import { initDevframe } from 'devframe/initiate'

const devtools = initDevframe(myDevframe, { base: '/__my-tool/', key: 'my-tool' })
export const GET = ({ request }) => devtools.handler(request)
```

:::

For frameworks with dev-time module reloading (Next, Nitro, SvelteKit), always set `key` — a re-evaluation returns the live instance instead of leaking WebSocket servers (`DF0053` reports an intentional replacement when the options changed).

## The WebSocket binding

Fetch handlers hand over `Request`s, so the RPC socket needs its own binding. The instance resolves it in precedence order and advertises the result in `__connection.json` — the browser client follows whatever is advertised:

1. **`ws.port`** — an explicit side-car port.
2. **`server`** — share the host's `node:http` server; the upgrade binds at `<base>__ws`. Zero extra ports, and the socket follows the app through proxies and HTTPS.
3. **`ws.url` alone** — advertise an external endpoint verbatim; the server behind that URL owns the transport (wire the instance's `context` into your own server with `startHttpAndWs`). Combined with `server`/`ws.port`, `ws.url` overrides only the advertisement — the tunnel pattern.
4. **Bun** — same-origin fetch upgrades: pass the `Bun.serve` server as `handler`'s second argument and wire `Bun.serve({ websocket: devtools.websocket })`.
5. **Default** — an eager side-car on a free port, started at init so the meta is stable from the first request.

## Auth

The instance **gates by default** — a handler mounted inside an app server is reachable by anything that can open its socket. Devframe's interactive OTP handler is wired automatically and prints its code/magic-link banner once the public origin is known (derived from the first request, or the `origin` option). Pass `auth: false` for a single-user localhost setup, or a `DevframeAuthHandler` for a custom scheme.

## Relation to the other adapters

`createDevServer`, `viteDevBridge`, and `@devframes/next` are assembled from this instance internally — the handler is the one wiring underneath every serving path. To host **many** devframes behind one namespace with shared transport and docks, use the hub's counterpart: [`initHub`](../guide/hub-initiate).
