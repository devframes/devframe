---
outline: deep
---

# Next Helper

> [!WARNING]
> Experimental. `@devframes/next` ships as an in-repo spike ([plan 027](https://github.com/devframes/devframe/blob/main/plans/notes/devframes-next-proposal.md)) and isn't published to npm yet. The API described here is the proposed surface; expect changes before a stable release.

The `@devframes/next` package hosts one or more devframes from a Next.js App Router app. Next runs on webpack/Turbopack rather than Vite, so it hosts through a route handler instead of the [Vite Bridge](./vite-bridge): the package hands you a `DevframeHost` plus a single `fetch` handler your catch-all route delegates to.

It handles the two things a Next.js host needs:

1. **Static + connection serving.** `createDevframeNextHost()` returns a `DevframeHost` whose `mountStatic` / `mountConnectionMeta` calls accumulate into one WHATWG-`fetch` handler that serves every mounted SPA — reusing devframe's own [`serveStaticHandler`](/adapters/dev) for SPA fallback, content types, and path-traversal guarding — and answers each `<base>/__connection.json`.
2. **Host-mode Next config.** `withDevframe()` applies the one Next setting a devframe host requires.

## Install

```ts [next.config.mjs]
import { withDevframe } from '@devframes/next'

export default withDevframe({
  transpilePackages: ['@antfu/design'],
})
```

`withDevframe` sets `skipTrailingSlashRedirect: true` and preserves the rest of your config. Mounted SPAs are served at `/__<id>/` and reference their assets relatively (`./_next/…`); Next's default trailing-slash redirect (`/__git/` → `/__git`) would re-root those paths and 404 every asset, so a host serves the base verbatim.

## Hosting a devframe

Build the host once (a module-level singleton, since App Router invokes route handlers per request), then delegate both routes to its `fetch`:

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

The same `fetch` answers the hub's own `__hub/__connection.json` — register `/__hub` with `mountConnectionMeta` and one route body covers both.

## API

### `createDevframeNextHost(options)`

| Option | Description |
|--------|-------------|
| `resolveOrigin` | Returns the public origin the app is reachable at, for docks needing an absolute iframe URL. |
| `getStorageDir` | Resolves a directory for persisted state per `scope` (`workspace` / `project` / `global`). |
| `connectionMeta` | Optional initial meta; usually published later via `setConnectionMeta`. |

Returns `{ host, fetch, setConnectionMeta }`:

- **`host`** — the [`DevframeHost`](/guide/hub) to pass to `createHubContext` / `createHostContext`.
- **`fetch(request)`** — the WHATWG-`fetch` handler your route delegates to. Connection meta is matched before the static handler, so an SPA fallback never swallows a `<base>/__connection.json` discovery fetch.
- **`setConnectionMeta(meta)`** — publish the live meta once the RPC/WS port is known. Until then, meta requests answer `503` so a racing client retries rather than caching a wrong endpoint.

### `withDevframe(nextConfig)`

Returns a Next config with `skipTrailingSlashRedirect: true` applied, preserving everything else.

## Runtime

Route handlers that call `fetch` pin `export const runtime = 'nodejs'`: the static handler streams built SPA files from disk, and the side-car RPC/WS server the hub starts is a Node process.

## See also

- [Vite Bridge](./vite-bridge) — the equivalent for Vite-based hosts
- [Hub](/guide/hub) — `createHubContext`, `mountDevframe`, and `DevframeHost`
- [minimal-next-devframe-hub](/examples/minimal-next-devframe-hub) — a full working host
