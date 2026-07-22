# minimal-json-render

A standalone devframe that serves a **JSON-render view**: the server authors an
`@json-render/core` spec once, and the browser renders it with the official
`@devframes/json-render-ui` Vue frontend. It exercises the whole opt-in
JSON-render stack end to end:

- **`@devframes/json-render/node`** — `createJsonRenderView(ctx, { id, spec })`
  registers the spec as shared state, validates element props at ingress, and
  hands back a handle with `update` / `patchState` / `dispose`.
- **live state** — the server ticks `uptime` every second via `patchState`, so
  the view updates without replacing the whole spec.
- **action bridge** — the `Refresh` button's `press` action is dispatched as an
  RPC call of the same name; the handler bumps a counter and patches state.
- **`@devframes/json-render-ui`** — the SPA (`src/client`) subscribes to the
  view's shared state and renders it with `JsonRenderView`. The app supplies the
  frontend lib; devframe serves the SPA.

## Run

```sh
pnpm --filter minimal-json-render dev      # live dev server (http://localhost:9877/__minimal-json-render/)
pnpm --filter minimal-json-render build    # build the SPA
node bin.mjs build --out-dir dist/static   # static snapshot (read-only; actions render disabled)
```

In the static build, the spec + state are snapshotted as a read-only render and
the action bridge reports actions as unavailable — there is no live RPC.
