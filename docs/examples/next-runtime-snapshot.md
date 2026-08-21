---
outline: deep
---

# next-runtime-snapshot

A **Next.js App Router** SPA over RPC surfacing the host Node runtime — a React + Next.js build dropping in for a Preact + Vite SPA.

Package: `next-runtime-snapshot-example` · framework: **React (Next.js)**

## What it shows

- `…:system` — a `static` RPC, baked at build time or resolved live over WebSocket. Returns Node version, platform/arch, pid, cwd, start time.
- `…:memory` — a `query` the UI re-invokes from a refresh button.
- `…:env` — a `query` (valibot-validated args) listing env vars matching a regex, redacting secret-looking keys.
- `'use client'` components call `connectDevframe()` once, sharing the scoped client via context.

Next.js config non-defaults: `output: 'export'` (devframe owns the server), `assetPrefix: '.'` (relative assets), `trailingSlash: true` (directory-with-index resolution).

## Run it

```sh
pnpm -C examples/next-runtime-snapshot run build     # next build → static export
pnpm -C examples/next-runtime-snapshot run dev       # devframe CLI dev server
pnpm -C examples/next-runtime-snapshot run cli:build  # static deploy → dist/static
```

## Source

[`examples/next-runtime-snapshot`](https://github.com/devframes/devframe/tree/main/examples/next-runtime-snapshot)
