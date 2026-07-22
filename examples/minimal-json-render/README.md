# minimal-json-render

A standalone devframe that serves a **JSON-render view**: the server authors an
`@json-render/core` spec once, and the browser renders it with the official
`@devframes/json-render-ui` Vue frontend. The spec is a small **project
dashboard** that exercises **every base-catalog component** — `Stack`, `Card`,
`Text`, `Badge`, `Button`, `Icon`, `Divider`, `TextInput`, `Switch`,
`KeyValueTable`, `DataTable`, `CodeBlock`, `Progress`, and `Tree` — end to end:

- **`@devframes/json-render/node`** — `createJsonRenderView(ctx, { id, spec })`
  registers the spec as shared state, validates element props at ingress, and
  hands back a handle with `update` / `patchState` / `dispose`.
- **live state** — the server ticks `uptime` every second via `patchState`, so
  bound values (`{ $state: '/…' }`) update without replacing the whole spec.
- **two-way bindings** — the `Display name` input and the two switches write back
  into state via `{ $bindState: '/form/…' }`.
- **action bridge** — `Refresh` re-samples the coverage/bundle `Progress` bars;
  `Deploy` flips the `DataTable` into a loading state and appends a module;
  `Save` sends the bound form values as action params and the server writes the
  name into the `KeyValueTable`. Each is dispatched as an RPC call of the same
  name, with per-action loading and error surfacing.
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

## Reused by the hub shells

The view is factored into `src/dashboard.ts` and exported as
`minimal-json-render/dashboard` (`createDashboardView(ctx)` + `dashboardSpec`),
so the hub examples plug the very same view into their hub context and project
it onto a `json-render` dock — the [Vite hub](../minimal-vite-devframe-hub)
renders it with `@devframes/json-render-ui` (Vue), and the
[Next hub](../minimal-next-devframe-hub) renders it with a small React registry.
