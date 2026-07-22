---
outline: deep
---

# minimal-json-render

A standalone devframe that serves a **JSON-render view**: the server authors an
`@json-render/core` spec once, and the prebuilt `@devframes/json-render-ui` SPA
renders it — the app ships no client build of its own.

Package: `minimal-json-render` · frontend: **prebuilt `@devframes/json-render-ui/spa`**

## What it shows

- **`createJsonRenderView`** — registers the spec as shared state, validates
  element props at ingress, and returns a handle with `update` / `patchState` /
  `dispose`.
- **Live state** — the server ticks `uptime` every second via `patchState`, so
  the view updates without replacing the whole spec.
- **Action bridge** — the `Refresh` button's `press` action is dispatched as an
  RPC call of the same name; the handler bumps a counter and patches state, with
  per-action loading and error surfacing.
- **Out-of-box SPA** — `createJsonRenderDevframe` points `cli.distDir` at the
  prebuilt `@devframes/json-render-ui/spa`, which discovers the view from the
  view index and renders it — no client build in the example.
- **Static output** — `cli:build` snapshots the spec + state as a read-only
  render; the action bridge reports actions as unavailable (no live RPC).

## Run it

```sh
pnpm --filter minimal-json-render dev         # CLI dev server (live RPC)
pnpm --filter minimal-json-render cli:build   # static deploy → dist/static
```

The dev server serves the SPA at `/__minimal-json-render/`.

## Source

[`examples/minimal-json-render`](https://github.com/devframes/devframe/tree/main/examples/minimal-json-render)
