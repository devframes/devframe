---
outline: deep
---

# files-inspector

Lists the files in the current working directory and renders them through a **Preact** SPA. A node-modules-inspector-style demo that exercises every devframe surface end to end.

Package: `files-inspector-example` · framework: **Preact + Vite**

## What it shows

- **CLI dev server** — `node bin.mjs` boots an HTTP + WebSocket server backing live RPC.
- **Static build** — `node bin.mjs build` produces a self-contained directory (SPA + baked RPC dump) deployable to any static host.
- **Runtime base discovery** — the client is built with `vite.base: './'` and reads `document.baseURI` at runtime, so the same `dist/client` works under any base path without rebuilding.
- **Two RPC types** — `:list-files` is a `query` baked into the dump; `:get-cwd` is a `static` RPC.

## Run it

```sh
pnpm -C examples/files-inspector run build       # build the Preact client
pnpm -C examples/files-inspector run dev         # CLI dev server (live RPC)
pnpm -C examples/files-inspector run cli:build   # static deploy → dist/static
```

The dev server prints its URL. Serve `dist/static` from any static host — relative asset paths make it portable.

## Source

[`examples/files-inspector`](https://github.com/devframes/devframe/tree/main/examples/files-inspector)
