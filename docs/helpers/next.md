---
outline: deep
---

# Next Helper

> [!WARNING]
> Experimental. `@devframes/next` is published under the `experimental` npm tag (`npm i @devframes/next@experimental`) while its API settles. Expect changes before a stable release.

`@devframes/next` hosts devframes from a Next.js App Router app. Next runs on webpack/Turbopack rather than Vite, so it hosts through a route handler instead of the [Vite Bridge](./vite-bridge): the package serves each devframe's SPA and its `__connection.json` from a single `fetch` handler your catch-all route delegates to, reusing devframe's own [`serveStaticHandler`](/adapters/dev) for SPA fallback, content types, and path-traversal guarding.

It comes in three parts:

1. **`withDevframe()`** — applies the one Next config setting a devframe host needs.
2. **`createDevframeNextHandler()`** — hosts a single devframe (the common case).
3. **`createDevframeNextHost()`** — the lower-level primitive for a hub mounting many devframes at once.

Plus a React client surface at `@devframes/next/client`.

## Config

```ts [next.config.mjs]
import { withDevframe } from '@devframes/next'

export default withDevframe({
  // ...your own Next config
})
```

`withDevframe` sets `skipTrailingSlashRedirect: true` and preserves the rest. Mounted SPAs are served at `/__<id>/` and reference their assets relatively (`./_next/…`); Next's default trailing-slash redirect (`/__git/` → `/__git`) would re-root those paths and 404 every asset, so a host serves the base verbatim.

## Hosting a single devframe

`createDevframeNextHandler(definition)` statically serves the devframe's built SPA and starts a side-car RPC/WebSocket server, advertising it at `<base>/__connection.json`. Delegate your catch-all route to its `fetch`:

```ts [app/__my-tool/[[...path]]/route.ts]
import { createDevframeNextHandler } from '@devframes/next'
import myDevframe from '@/devframe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createDevframeNextHandler(myDevframe)
export const GET = handler.fetch
```

The base defaults to `def.basePath ?? '/__<id>/'`. `close()` shuts the side-car down; `ready` resolves once it's listening.

| Option | Default | Description |
|--------|---------|-------------|
| `base` | `def.basePath ?? '/__<id>/'` | Mount path for the SPA. |
| `host` | `def.cli?.host ?? 'localhost'` | Side-car bind host. |
| `port` | resolved from `def.cli?.port` | Side-car port. |
| `flags` | — | Forwarded to `def.setup(ctx, { flags })`. |
| `auth` | `false` | `true` for devframe's OTP gate, or a handler. The Next app owns auth by default. |

## Hosting a hub

For many devframes at once, use `createDevframeNextHost()` with [`@devframes/hub`](/guide/hub). Its `host` accumulates every `mountStatic` / `mountConnectionMeta` call into one `fetch` handler:

```ts [devframe/host.ts]
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import { createDevframeNextHost } from '@devframes/next'
import { startHttpAndWs } from 'devframe/node'

const nextHost = createDevframeNextHost({
  resolveOrigin: () => 'http://localhost:3000',
  getStorageDir: scope => resolveStorageDir(scope),
})

const context = await createHubContext({ host: nextHost.host, mode: 'dev' })
await mountDevframe(context, myDevframe)
nextHost.host.mountConnectionMeta('/__hub') // the hub's own connection base

const started = await startHttpAndWs({ context, port, auth: false })
nextHost.setConnectionMeta({ backend: 'websocket', websocket: started.port })

export const hub = { fetch: nextHost.fetch }
```

```ts [app/__[id]/[[...path]]/route.ts]
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return hub.fetch(request) // serves every mounted SPA + connection meta
}
```

`createDevframeNextHost` returns `{ host, fetch, setConnectionMeta }`:

- **`host`** — the [`DevframeHost`](/guide/hub) to pass to `createHubContext` / `createHostContext`.
- **`fetch(request)`** — the handler your route delegates to. Connection meta is matched before the static handler, so an SPA fallback never swallows a `<base>/__connection.json` discovery fetch; a miss returns a bare `404`.
- **`setConnectionMeta(meta)`** — publish the live meta once the RPC/WS port is known. Until then, meta requests answer `503` so a racing client retries rather than caching a wrong endpoint.

## React client

`@devframes/next/client` connects to the RPC backend and provides the client to your component tree — the React counterpart to `@devframes/nuxt`'s `$rpc` plugin.

```tsx [app/providers.tsx]
'use client'
import { RpcProvider } from '@devframes/next/client'

export function Providers({ children }: { children: React.ReactNode }) {
  return <RpcProvider baseURL="/__my-tool/">{children}</RpcProvider>
}
```

```tsx [app/panel.tsx]
'use client'
import { useRpc } from '@devframes/next/client'

export function Panel() {
  const rpc = useRpc().scope('my-tool:')
  // rpc.call('get-payload'), rpc.sharedState, …
}
```

`RpcProvider` renders its `fallback` (default `null`) until the client connects, so `useRpc()` always returns a live client. Theming and layout stay app-owned.

## Runtime

Route handlers that call `fetch` pin `export const runtime = 'nodejs'`: the static handler streams built SPA files from disk, and the side-car RPC/WS server is a Node process.

## See also

- [Vite Bridge](./vite-bridge) — the equivalent for Vite-based hosts
- [Hub](/guide/hub) — `createHubContext`, `mountDevframe`, and `DevframeHost`
- [minimal-next-devframe-hub](/examples/minimal-next-devframe-hub) — a full working host
