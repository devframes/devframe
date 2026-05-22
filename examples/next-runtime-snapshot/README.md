# next-runtime-snapshot

End-to-end devframe demo with a **Next.js App Router** SPA. Shows that any
React+Next.js build is a drop-in replacement for a Preact+Vite SPA: devframe
serves the static export, the client calls into the host Node process via
type-safe RPC.

## What it shows

- `next-runtime-snapshot:system` — a `static` RPC function. Runs once at
  build time when baked into a static dump, otherwise resolved live over
  WebSocket. Returns Node version, platform/arch, pid, cwd, start time.
- `next-runtime-snapshot:memory` — a `query` RPC function. Re-runnable;
  the UI has a refresh button that re-invokes the handler.
- `next-runtime-snapshot:env` — a `query` RPC function with valibot-validated
  args (`pattern`, `limit`). Lists environment variables matching a regex,
  redacting keys that look secret.
- Next.js App Router with `'use client'` components calling
  `connectDevframe()` once and passing the RPC client through React context.

## Run it

```sh
pnpm -C examples/next-runtime-snapshot run build  # next build → static export → dist/client/
pnpm -C examples/next-runtime-snapshot run dev    # node bin.mjs → devframe CLI
```

Open `http://localhost:9899/__next-runtime-snapshot/` — the three cards
populate from RPC, the env filter is debounced, and the footer shows the
connection backend.

## Build a static deployment

```sh
pnpm -C examples/next-runtime-snapshot run cli:build
```

Output lands in `dist/static/`. Serve it from any static host (`npx serve
dist/static`) — the `static` and `query` RPCs that opted into the dump still
work because the snapshot is baked at build time.

## Next.js config — three settings worth knowing

`src/client/next.config.mjs` is short on purpose. The three non-defaults
each correspond to a devframe design principle:

- **`output: 'export'`** — devframe owns the HTTP server; Next.js produces a
  fully static SPA. No Next.js runtime is required at serve time, so server
  components and route handlers are rendered at build time only.
- **`assetPrefix: '.'`** — relative asset paths so the same build works at
  `/`, `/__next-runtime-snapshot/`, and any custom base. Devframe's design
  principle: SPAs own their base path at runtime, discovered from
  `document.baseURI`.
- **`trailingSlash: true`** — emits `foo/index.html` rather than `foo.html`,
  which composes cleanly with devframe's static handler directory-with-index
  resolution.

The `dist/client/` artifact is a copy of `src/client/out/` (Next.js's
default export directory) — the `build` script just renames it so the
example matches the layout used by the other examples in this repo.
