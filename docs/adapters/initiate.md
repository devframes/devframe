# The Standard Handler

`initDevframe()` is the boundary the whole project is built on: it turns a `DevframeDefinition` into a live instance whose `.handler` — a Web Standard `(request: Request) => Promise<Response>` — carries the entire surface (SPA, `__connection.json` discovery, RPC socket, auth gate, MCP route) under one mount base. Every other serving path — the [adapters](./), the [framework packages](/frameworks/), and the [hub](../guide/hub-initiate) — is assembled from it. Mount it in any app with a catch-all route.

```ts
import { initDevframe } from 'devframe/initiate'
import myDevframe from './devframe'

const devtools = initDevframe(myDevframe, { base: '/__my-tool/' })
// devtools.base, devtools.handler, devtools.nodeMiddleware, devtools.attach,
// devtools.handleUpgrade, devtools.ready, devtools.context,
// devtools.connectionMeta(), devtools.close()
```

`base` is required, so the mount path is explicit — pass `resolveBasePath(def, 'hosted')` (`def.basePath ?? /__<id>/`) if you don't want to pick one; the instance echoes it back as `devtools.base`. `handler`/`nodeMiddleware` await readiness internally, so hosts never race boot. Creating an instance binds no port — [the WebSocket binding](#the-websocket-binding) is the host's call.

## Mount the handler

::: code-group

```ts [Vite]
// vite.config.ts
// connect-style middleware + Vite's own server for the socket
import { initDevframe } from 'devframe/initiate'
import { defineConfig } from 'vite'
import myDevframe from './devframe'

export default defineConfig({
  plugins: [{
    name: 'my-tool',
    apply: 'serve',
    configureServer(server) {
      const devtools = initDevframe(myDevframe, {
        base: '/__my-tool/',
        server: server.httpServer ?? undefined,
      })
      server.middlewares.use(devtools.nodeMiddleware)
    },
  }],
})
```

```ts [Nitro]
// routes/__my-tool/[...path].ts
// routes/__my-tool/index.ts
// for the namespace root, since a catch-all doesn't match its own empty path.
import { defineHandler } from 'nitro'
import { devtools } from '../../devtools'

export default defineHandler(event => devtools.handler(event.req))
```

```ts [Hono]
// server.ts
// `serve()` hands back the node server the socket rides on
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { devtools } from './devtools'

const app = new Hono()
app.all('/__my-tool/*', c => devtools.handler(c.req.raw))
devtools.attach(serve({ fetch: app.fetch, port: 3000 }))
```

```ts [Next.js]
// app/%5F_my-tool/[[...path]]/route.ts
// Next reserves `_`-prefixed folders, so the segment is URL-encoded (`%5F_` decodes to `__`).
import { initDevframe } from 'devframe/initiate'
import myDevframe from '@/devframe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Route handlers never see upgrades, so the socket asks for a side-car; the
// globalThis memo keeps a dev-time reload from starting a second one.
const g = globalThis as { devtools?: ReturnType<typeof initDevframe> }
const devtools = g.devtools ??= initDevframe(myDevframe, {
  base: '/__my-tool/',
  ws: { sidecar: true },
})
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

const g = globalThis as { devtools?: ReturnType<typeof initDevframe> }
const devtools = g.devtools ??= initDevframe(myDevframe, {
  base: '/__my-tool/',
  ws: { sidecar: true },
})
export const GET = ({ request }) => devtools.handler(request)
```

:::

Frameworks with dev-time module reloading (Next, Nitro, SvelteKit) re-evaluate the calling module, so memoize the instance on `globalThis` — otherwise every reload leaks the previous socket. `@devframes/next`'s `createDevframeNextHandler` does this for you.

## The WebSocket binding

Fetch handlers hand over `Request`s, so the host binds the RPC socket explicitly. The **local binding** resolves in precedence order:

1. **`ws.port`** — a side-car server on that exact port.
2. **`server`** — share the host's `node:http` server; the upgrade binds at `<base>__ws`. No extra ports; the socket follows the app through proxies and HTTPS.
3. **`ws: { sidecar: true }`** — a side-car server on a free port, for hosts whose handlers never see upgrades (Next.js route handlers, Nitro, Rsbuild).
4. **The host's own upgrades** — with none of the above, the socket waits: `devtools.attach(server)` routes a server's `upgrade` events (returning a detach fn); `devtools.handleUpgrade(req, socket, head)` completes a single one from a listener you own. Built lazily.

`ws.url` controls the *advertisement* instead — the browser dials it verbatim. Alone, an external server owns the transport and its auth (wire in the instance's `context` via `createContextRpcServer` + a WS transport); alongside a local binding it overrides only what's advertised (the tunnel pattern).

`__connection.json` describes whichever combination is active. Asking a configured instance to also take over host upgrades reports `DF0055` (a local binding owns the socket) or `DF0056` (`ws.url` handed it off).

## Auth

The instance **gates by default**. The interactive OTP handler is wired automatically and prints its code/magic-link banner once the public origin is known (the first request, or the `origin` option). Pass `auth: false` for single-user localhost, or a `DevframeAuthHandler` for a custom scheme.

## Relation to the other adapters

`createDevServer`, `devframeViteBridge` (`@devframes/vite`), and `@devframes/next` are assembled from this instance internally. To host **many** devframes with shared transport and docks, use [`initHub`](../guide/hub-initiate).
