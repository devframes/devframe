---
outline: deep
---

# json-render

The server authors an `@json-render/core` spec that the prebuilt
`@devframes/json-render-ui` SPA renders — no client build.

Package: `json-render` · frontend: **prebuilt `@devframes/json-render-ui/spa`**

## What it shows

- **`createJsonRenderView`** — registers the spec as shared state, validates
  props; handle: `update` / `patchState` / `dispose`.
- **Live state** — server ticks `uptime` every second via `patchState`.
- **Action bridge** — `Refresh`'s `press` action dispatches as a same-named
  RPC call; per-action loading/error.
- **Out-of-box SPA** — `createJsonRenderDevframe` sets `clientAssets` to
  `@devframes/json-render-ui/spa`.
- **Static output** — `cli:build` snapshots spec + state read-only; actions
  unavailable (no live RPC).

## Run it

```sh
pnpm --filter json-render dev         # CLI dev server (live RPC)
pnpm --filter json-render cli:build   # static deploy → dist/static
```

Served at `/__json-render/`.

## Source

[`examples/json-render`](https://github.com/devframes/devframe/tree/main/examples/json-render)
