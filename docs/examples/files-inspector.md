---
outline: deep
---

# files-inspector

Lists cwd files through a **Preact** SPA.

Package: `files-inspector-example` · framework: **Preact + Vite**

## What it shows

- **CLI dev server** — `node bin.mjs` boots an HTTP + WebSocket server for RPC.
- **Static build** — `node bin.mjs build` produces a self-contained SPA + RPC dump.
- **Runtime base discovery** — `vite.base: './'` plus `document.baseURI` read at runtime, so `dist/client` works anywhere.
- **Two RPC types** — `:list-files` (`query`, baked into dump); `:get-cwd` (`static`).

## Run it

```sh
pnpm -C examples/files-inspector run build       # build the Preact client
pnpm -C examples/files-inspector run dev         # CLI dev server (live RPC)
pnpm -C examples/files-inspector run cli:build   # static deploy → dist/static
```

## Source

[`examples/files-inspector`](https://github.com/devframes/devframe/tree/main/examples/files-inspector)
