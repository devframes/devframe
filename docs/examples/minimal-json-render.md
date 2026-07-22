---
outline: deep
---

# minimal-json-render

A standalone devframe that serves a **JSON-render view**: the server authors an
`@json-render/core` spec once, and the browser renders it with the official
`@devframes/json-render-ui` Vue frontend.

Package: `minimal-json-render` · framework: **Vue + Vite**

## What it shows

- **`createJsonRenderView`** — registers the spec as shared state, validates
  element props at ingress, and returns a handle with `update` / `patchState` /
  `dispose`.
- **Live state** — the server ticks `uptime` every second via `patchState`, so
  the view updates without replacing the whole spec.
- **Action bridge** — the `Refresh` button's `press` action is dispatched as an
  RPC call of the same name; the handler bumps a counter and patches state, with
  per-action loading and error surfacing.
- **Standalone rendering** — the app supplies the frontend lib
  (`@devframes/json-render-ui`); devframe serves the SPA, which subscribes to
  the view's shared state and renders it with `JsonRenderView`.
- **Static output** — `cli:build` snapshots the spec + state as a read-only
  render; the action bridge reports actions as unavailable (no live RPC).

## Run it

```sh
pnpm --filter minimal-json-render dev         # CLI dev server (live RPC)
pnpm --filter minimal-json-render build       # build the Vue client
pnpm --filter minimal-json-render cli:build   # static deploy → dist/static
```

The dev server serves the SPA at `/__minimal-json-render/`.

## Source

[`examples/minimal-json-render`](https://github.com/devframes/devframe/tree/main/examples/minimal-json-render)
