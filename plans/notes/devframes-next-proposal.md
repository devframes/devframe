# Proposal: `@devframes/next` host-integration package

> Origin: spike for plan 027. Status: **promoted** — `@devframes/next` now ships
> as a published (experimental-tag) package with the single-plugin handler, the
> React client surface, and API snapshots in place. This document is the design
> write-up; the "Promotion" section below records how each open question landed.

## Problem

Both Next examples hand-rolled static serving that re-implements what
`packages/devframe/src/utils/serve-static.ts` already owns and tests. The worst
offender was `examples/minimal-next-devframe-hub`, whose App Router catch-all
route (`app/__[id]/[[...path]]/route.ts`, 109 lines) carried its own
content-type map, path-traversal guard, directory→`index.html` resolution, SPA
fallback, and file streaming — plus a `STATIC_MOUNTS` registry, a
`CONNECTION_META_BASES` matcher, and a by-hand `DevframeHost` in its host module
(~90 more lines). `@devframes/nuxt` existed with no Next counterpart, an
asymmetry versus the documented Axis-A targets.

`@devframes/nuxt` stays tiny (~190 lines) because Nuxt is Vite-based, so it
reuses devframe's `viteDevBridge` verbatim. **Next is webpack/Turbopack, so it
cannot reuse that path** — it must own route handlers. That is the whole reason
the boilerplate existed and the reason a dedicated bridge is justified.

## What a Next host actually needs

The example is a **hub** (many devframes mounted at once), not a single plugin.
Its `DevframeHost.mountStatic` / `mountConnectionMeta` are called once per
mounted devframe (git, terminals, inspect, a11y, …) plus the a11y agent module,
accumulating a set of `(base → distDir)` static mounts and a set of
connection-meta bases. So the bridge's core job is not "serve one definition's
`distDir`" (plan 027's first-draft `createDevframeNextHandler(definition)`
signature) — it is:

> provide a `DevframeHost` whose mount calls accumulate into **one WHATWG-`fetch`
> handler** that a Next catch-all route delegates to.

## API (implemented)

```ts
import { createDevframeNextHost, withDevframe } from '@devframes/next'

const { host, fetch, setConnectionMeta } = createDevframeNextHost({
  resolveOrigin: () => 'http://localhost:3000',
  getStorageDir: scope => /* workspace | project | global dir */,
})
```

- **`createDevframeNextHost(options) → { host, fetch, setConnectionMeta }`**
  - `host: DevframeHost` — hand to `createHubContext` / `createHostContext`.
    `mountStatic(base, dir)` mounts `dir` on an internal h3 app at `base`;
    `mountConnectionMeta(base)` registers a meta base.
  - `fetch(request: Request) => Promise<Response>` — the single handler both
    App Router routes delegate to. Serves every mounted SPA through devframe's
    shared `serveStaticHandler` (SPA fallback, content types, traversal guard
    all reused) and answers `<base>/__connection.json` for each registered base
    **before** the static handler runs, so an SPA fallback can't swallow the
    discovery fetch.
  - `setConnectionMeta(meta)` — publish the live meta once the RPC/WS port is
    known. Until then meta requests return `503` (a racing client retries rather
    than caching a wrong endpoint).
- **`withDevframe(nextConfig) → nextConfig`** — applies the host-mode Next
  setting `skipTrailingSlashRedirect: true` (so mounted SPAs' relative assets
  under `/__<id>/` resolve rather than 404 on Next's trailing-slash redirect),
  preserving everything else.

### How the reuse works

`serveStaticHandler` is an h3 v2 `EventHandler` and h3 v2's `H3` instance is
itself a WHATWG-`fetch` handler (`app.fetch(request)`), which is exactly what an
App Router route returns. So the bridge mounts one static sub-app per base
(`app.mount(base, sub)` — h3 strips the base and matches on segment boundaries,
giving the same longest-prefix behavior the hand-rolled registry did) and
delegates. No static-serving logic is re-implemented; the package is ~130 lines.

### Route handler after the refactor

```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const hub = await ensureMinimalNextDevframeHub()
  return hub.fetch(request)
}
```

Both the catch-all SPA route and the `__hub/__connection.json` route collapse to
this (the host registers `/__hub` as a meta base so the one `fetch` covers the
hub's own discovery too).

## Runtime choice: Node

The route pins `export const runtime = 'nodejs'` because `serveStaticHandler`
streams from the filesystem (`node:fs` + `node:stream`). Edge is out of scope:
serving a built SPA off disk is inherently a Node concern, and the side-car
RPC/WS server the hub starts is Node-only regardless. An Edge story would need a
fetch-native asset source (e.g. imported/bundled assets) and is not required by
either example — noted as a non-goal, not a limitation to design around now.

## Connection-descriptor contract

Consistent across both Next examples and every other adapter: the live shape is
`{ backend: 'websocket', websocket: <port|{ port, path }> }` and the baked
(static-build) shape is `{ backend: 'static' }`. The bridge serves whatever meta
`setConnectionMeta` is handed, so it imposes no new contract. Plan 027's second
STOP condition (contract divergence) does not trip.

## Acceptance (verified in the spike)

- `pnpm --filter @devframes/next build` + `typecheck` — green; emits
  `dist/index.mjs` + `dist/index.d.mts`.
- `pnpm typecheck` (all 21 workspace tasks, incl. the coverage guard) — green.
- `examples/minimal-next-devframe-hub` refactored onto the bridge: the 109-line
  catch-all route, both hand-rolled registries, and the by-hand `DevframeHost`
  are gone; both routes now delegate to `hub.fetch`. `pnpm --filter
  minimal-next-devframe-hub build` (Next 16 / Turbopack) succeeds and the
  example's 4 existing tests pass.
- Runtime smoke against a **real** built plugin SPA (`plugins/git/dist/client`)
  confirmed: dir→`index.html`, direct file with correct content type, SPA
  fallback for extensionless routes, `HEAD`, `404` for unmounted bases, meta
  `503`→`200` after `setConnectionMeta`, and meta taking precedence over SPA
  fallback for both the plugin and hub bases.

## Promotion (how each open question landed)

1. **`createDevframeNextHandler(definition, options)` — implemented.** The
   single-plugin wrapper composes `createDevframeNextHost` (SPA + meta serving)
   with a bridge-mode `createDevServer` side-car (WS on its own port, advertised
   at `<base>/__connection.json`), mirroring `viteDevBridge`'s bridge mode. It
   returns `{ fetch, ready, close }` and throws early when `cli.distDir` is
   missing. Covered by `packages/next/test/handler.test.ts` (boots a real
   side-car against a temp `distDir` and asserts SPA serving, SPA fallback, the
   WS-port meta, and a bare 404).
2. **Client surface — implemented** at `@devframes/next/client` (React peer,
   optional). `RpcProvider` calls `connectDevframe()` once and provides the
   client; `useRpc()` reads it (throwing outside a provider). The `'use client'`
   directive is preserved through the browser build. A theme/layout helper was
   deliberately left out — theming is design-system-specific and stays
   app-owned.
3. **Publishing shape — done.** `private` dropped; `publishConfig.tag:
   "experimental"` publishes under the `experimental` tag, not `latest`. `next`
   and `react` are optional peers; exports are `.` (Node) + `./client`
   (browser). tsnapi snapshots generated under
   `tests/__snapshots__/tsnapi/@devframes/next/` (`index` + `client`).
4. **404 body — parity added.** The host `fetch` normalizes any miss to a
   body-less `404`, matching a plain static server (h3's default JSON error body
   is dropped).
5. **`next-runtime-snapshot` needs no bridge.** It uses Next only as a static-SPA
   builder while devframe owns the server via `createCac`/`createBuild`; the
   bridge doesn't apply. Left as-is (recorded so a future reader doesn't try to
   "unify" the two Next examples).

## Files

- `packages/next/` — `src/host.ts` (`createDevframeNextHost`), `src/handler.ts`
  (`createDevframeNextHandler`), `src/client.tsx` (`RpcProvider` / `useRpc`),
  `src/config.ts` (`withDevframe`), `src/index.ts`, plus `package.json` (public,
  experimental tag) / `tsconfig.json` / `tsdown.config.ts` (node + browser).
- `tsconfig.base.json` + `alias.ts` — `@devframes/next` and `/client` source aliases.
- `vitest.config.ts` — `packages/next` project; `tests/__snapshots__/tsnapi/@devframes/next/` API snapshots.
- `examples/minimal-next-devframe-hub/` — host module, both route handlers, and
  `next.config.mjs` on the bridge; `@devframes/next` as a dep.
