---
outline: deep
---

# next-runtime-snapshot

A **Next.js App Router** SPA over RPC, surfacing the host Node runtime — system info, memory, and environment variables. It shows that a React + Next.js build is a drop-in replacement for a Preact + Vite SPA: devframe serves the static export, and the client calls into the host Node process through the same type-safe RPC.

Package: `next-runtime-snapshot-example` · framework: **React (Next.js)**

## What it shows

- `…:system` — a `static` RPC. Runs once at build time when baked into a static dump, otherwise resolved live over WebSocket. Returns Node version, platform / arch, pid, cwd, and start time.
- `…:memory` — a `query` RPC the UI re-invokes from a refresh button.
- `…:env` — a `query` with valibot-validated args, listing environment variables matching a regex and redacting keys that look secret.
- Next.js App Router with `'use client'` components calling `connectDevframe()` once, then sharing the scoped client through React context.

The Next.js config carries three non-defaults that each map to a devframe design principle: `output: 'export'` (devframe owns the server), `assetPrefix: '.'` (relative assets so the same build works at any base), and `trailingSlash: true` (composes with devframe's directory-with-index static resolution).

## Run it

```sh
pnpm -C examples/next-runtime-snapshot run build     # next build → static export
pnpm -C examples/next-runtime-snapshot run dev       # devframe CLI dev server
pnpm -C examples/next-runtime-snapshot run cli:build  # static deploy → dist/static
```

The three cards populate from RPC; the static deploy still works because the `static` and `query` RPCs that opted into the dump are baked at build time.

## Source

[`examples/next-runtime-snapshot`](https://github.com/devframes/devframe/tree/main/examples/next-runtime-snapshot)
