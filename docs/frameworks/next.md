---
outline: deep
---

# Next

> [!WARNING]
> Experimental. `@devframes/next`'s API is still settling — expect changes before a stable release.

`@devframes/next` hosts devframes from a Next.js App Router app through a route handler (Next runs on webpack/Turbopack, not [Vite](./vite)). A single `fetch` handler serves each SPA and its `__connection.json` via [`serveStaticHandler`](/adapters/dev).

`@devframes/next` splits into `@devframes/next/single` and [`@devframes/next/hub`](#mounting-a-hub); the bare import throws. The `single` scope offers **`withDevframe()`**, **`createDevframeNextHandler()`**, and a React client at `@devframes/next/single/client`.

## Config

```ts [next.config.mjs]
import { withDevframe } from '@devframes/next/single'

export default withDevframe({
  // ...your own Next config
})
```

`withDevframe` sets `skipTrailingSlashRedirect: true` and preserves the rest (else Next re-roots the SPAs' relative assets and 404s them).

## Hosting a single devframe

`createDevframeNextHandler(definition)` serves the built SPA and starts a side-car RPC/WebSocket server at `<base>/__connection.json`; delegate your route to `fetch`:

```ts [app/__my-tool/[[...path]]/route.ts]
import { createDevframeNextHandler } from '@devframes/next/single'
import myDevframe from '@/devframe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createDevframeNextHandler(myDevframe)
export const GET = handler.fetch
```

`close()` shuts the side-car down; `ready` resolves once it's listening.

| Option | Default | Description |
|--------|---------|-------------|
| `base` | `def.basePath ?? '/__<id>/'` | Mount path for the SPA. |
| `host` | `def.cli?.host ?? 'localhost'` | Side-car bind host. |
| `port` | resolved from `def.cli?.port` | Side-car port. |
| `flags` | — | Forwarded to `def.setup(ctx, { flags })`. |
| `auth` | `false` | `true` for devframe's OTP gate, or a handler. |
| `key` | `@devframes/next:<id>:<base>` | Memoization key on `globalThis`. |

## Hosting a hub

For many devframes, [`@devframes/hub`](/guide/hub)'s `initHub` assembles every frame under `<base><id>/` behind a single `handler`:

```ts [devframe/host.ts]
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'

// Next route handlers can't accept WS upgrades, so the socket asks for a
// side-car of its own; the browser discovers it via `__connection.json`.
const hub = initHub({
  base: DEVFRAMES_HUB_BASE,
  devframes: [myDevframe],
  ws: { sidecar: true },
  auth: false,
})

export const { handler } = hub // mount on a `[[...path]]` route handler
```

```ts [app/__devframes/[[...path]]/route.ts]
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handler(request) // serves every mounted SPA + connection meta
}
```

Memoize the instance on `globalThis` so re-evaluation reuses one hub — see `examples/hub-next`.

## React client

`@devframes/next/single/client` provides the RPC client to your component tree.

```tsx [app/providers.tsx]
'use client'
import { RpcProvider } from '@devframes/next/single/client'

export function Providers({ children }: { children: React.ReactNode }) {
  return <RpcProvider baseURL="/__my-tool/">{children}</RpcProvider>
}
```

`useRpc()` returns the connected `DevframeRpcClient`, or `null` while connecting. `useRpcStatus()` returns the live `{ status, error }`.

```tsx [app/panel.tsx]
'use client'
import { useRpc, useRpcStatus } from '@devframes/next/single/client'

export function Panel() {
  const rpc = useRpc()?.scope('my-tool:')
  const { status, error } = useRpcStatus()
  if (!rpc)
    return <p>{error ? `connection failed — ${error.message}` : 'connecting…'}</p>
  // rpc.rpc.call('get-payload'), rpc.sharedState, …
}
```

Both hooks throw outside a `<RpcProvider>`.

## Runtime

Route handlers that call `fetch` pin `export const runtime = 'nodejs'` (the side-car is a Node process).

## Mounting a hub

`@devframes/next/hub`'s `nextDevframeHub()` is a route handle memoized on `globalThis`; `createNextDevframeHub()` is the underlying builder. The UI defaults to `@devframes/hub-ui`; `ui` swaps it, `ui: false` gives a headless hub driven by `@devframes/next/hub/client` (`useDevframeHubClient()`).

```ts [app/__devframes/[[...path]]/route.ts]
import { nextDevframeHub } from '@devframes/next/hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const hub = nextDevframeHub({ devframes: [] })
export const GET = (req: Request) => hub.handler(req)
export const POST = (req: Request) => hub.handler(req)
export const DELETE = (req: Request) => hub.handler(req)
```

Next has no native hub viewer, so this scope stays quiet. `createDevframeNextHost()` is the lower-level `DevframeHost` seam for `initHub({ context })`.

## See also

- [Vite](./vite)
- [Hub](/guide/hub) — `initHub`, `ctx.install`, `DevframeHost`
- [hub-next](/examples/hub-next)
