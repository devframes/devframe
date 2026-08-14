---
outline: deep
---

# Next

> [!WARNING]
> Experimental. `@devframes/next`'s API is still settling — expect changes before a stable release.

`@devframes/next` hosts devframes from a Next.js App Router app. Next runs on webpack/Turbopack rather than Vite, so it hosts through a route handler instead of the [Vite](./vite): the package serves each devframe's SPA and its `__connection.json` from a single `fetch` handler your catch-all route delegates to, reusing devframe's own [`serveStaticHandler`](/adapters/dev) for SPA fallback, content types, and path-traversal guarding.

`@devframes/next` splits into two scopes: `@devframes/next/dev-spa` (author one devframe with Next) and [`@devframes/next/hub`](#mounting-a-hub) (mount a whole devframes-hub). The bare `@devframes/next` import throws with a pointer to both.

The `dev-spa` scope comes in two parts:

1. **`withDevframe()`** — applies the one Next config setting a devframe host needs.
2. **`createDevframeNextHandler()`** — hosts a single devframe (the common case).

Plus a React client surface at `@devframes/next/dev-spa/client`.

## Config

```ts [next.config.mjs]
import { withDevframe } from '@devframes/next/dev-spa'

export default withDevframe({
  // ...your own Next config
})
```

`withDevframe` sets `skipTrailingSlashRedirect: true` and preserves the rest. Mounted SPAs are served at `/__<id>/` and reference their assets relatively (`./_next/…`); Next's default trailing-slash redirect (`/__git/` → `/__git`) would re-root those paths and 404 every asset, so a host serves the base verbatim.

## Hosting a single devframe

`createDevframeNextHandler(definition)` statically serves the devframe's built SPA and starts a side-car RPC/WebSocket server, advertising it at `<base>/__connection.json`. Delegate your catch-all route to its `fetch`:

```ts [app/__my-tool/[[...path]]/route.ts]
import { createDevframeNextHandler } from '@devframes/next/dev-spa'
import myDevframe from '@/devframe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = createDevframeNextHandler(myDevframe)
export const GET = handler.fetch
```

The base defaults to `def.basePath ?? '/__<id>/'`. `close()` shuts the side-car down; `ready` resolves once it's listening. The handler is memoized on `globalThis` under its `key`, so Next's dev-time route-module re-evaluation reuses the live one instead of starting a second side-car.

| Option | Default | Description |
|--------|---------|-------------|
| `base` | `def.basePath ?? '/__<id>/'` | Mount path for the SPA. |
| `host` | `def.cli?.host ?? 'localhost'` | Side-car bind host. |
| `port` | resolved from `def.cli?.port` | Side-car port. |
| `flags` | — | Forwarded to `def.setup(ctx, { flags })`. |
| `auth` | `false` | `true` for devframe's OTP gate, or a handler. The Next app owns auth by default. |
| `key` | `@devframes/next:<id>:<base>` | Memoization key for the handler on `globalThis`. |

## Hosting a hub

For many devframes at once, use [`@devframes/hub`](/guide/hub)'s `initHub` — one call assembles every frame under `<base><id>/` behind a single web-standard `handler` you mount on a catch-all route:

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

`initHub` returns one `handler` that serves every mounted SPA, the discovery endpoints, and the hub-level transport. Connection meta is matched before the static handlers, so an SPA fallback never swallows a `<base>__connection.json` discovery fetch; a miss returns a bare `404`. Memoize the instance on `globalThis` so Next's per-request route re-evaluation reuses one hub — see `examples/hub-next` for a full working host.

## React client

`@devframes/next/dev-spa/client` connects to the RPC backend and provides the client to your component tree — the React counterpart to `@devframes/nuxt`'s `$rpc` plugin. Children render immediately, so your shell and a connection indicator stay visible while the client connects.

```tsx [app/providers.tsx]
'use client'
import { RpcProvider } from '@devframes/next/dev-spa/client'

export function Providers({ children }: { children: React.ReactNode }) {
  return <RpcProvider baseURL="/__my-tool/">{children}</RpcProvider>
}
```

`useRpc()` returns the connected `DevframeRpcClient`, or `null` while connecting; scope it to your tool's namespace. `useRpcStatus()` returns the live `{ status, error }` for a connection indicator.

```tsx [app/panel.tsx]
'use client'
import { useRpc, useRpcStatus } from '@devframes/next/dev-spa/client'

export function Panel() {
  const rpc = useRpc()?.scope('my-tool:')
  const { status, error } = useRpcStatus()
  if (!rpc)
    return <p>{error ? `connection failed — ${error.message}` : 'connecting…'}</p>
  // rpc.rpc.call('get-payload'), rpc.sharedState, …
}
```

Both hooks throw outside a `<RpcProvider>`. Theming and layout stay app-owned.

## Runtime

Route handlers that call `fetch` pin `export const runtime = 'nodejs'`: the static handler streams built SPA files from disk, and the side-car RPC/WS server is a Node process.

## Mounting a hub

`@devframes/next/hub` mounts a whole [devframes-hub](/guide/hub) — many integrations under one namespace — from a single catch-all route. `nextDevframeHub()` returns a route handle memoized on `globalThis` (so Next's dev-time route re-evaluation reuses one instance); `createNextDevframeHub()` is the underlying builder. The UI defaults to `@devframes/hub-ui` (loaded through a bundler-ignored dynamic `import()` so its asset lookups resolve at request time); pass `ui` to swap it or `ui: false` for a headless hub you drive with the React client at `@devframes/next/hub/client` (`useDevframeHubClient()`).

```ts [app/__devframes/[[...path]]/route.ts]
import { nextDevframeHub } from '@devframes/next/hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const hub = nextDevframeHub({ devframes: [] })
export const GET = (req: Request) => hub.handler(req)
export const POST = (req: Request) => hub.handler(req)
export const DELETE = (req: Request) => hub.handler(req)
```

Unlike Vite and Nuxt, Next has no native hub viewer, so this scope prints no recommendation. `createDevframeNextHost()` remains available from `@devframes/next/hub` as the lower-level "bring your own `DevframeHost`" seam for `initHub({ context })`.

## See also

- [Vite](./vite) — the equivalent for Vite-based hosts
- [Hub](/guide/hub) — `initHub`, `ctx.install`, and `DevframeHost`
- [hub-next](/examples/hub-next) — a full working host
