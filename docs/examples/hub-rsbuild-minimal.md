---
outline: deep
---

# hub-rsbuild-minimal

The minimal [Rsbuild](https://rsbuild.dev) host for [`@devframes/hub`](/guide/hub): one `initHub()` call mounted into the dev server's middleware stack, the UI supplied by `@devframes/hub-ui`.

Package: `hub-rsbuild-minimal` · framework: **Rsbuild**

## What it shows

- `initHub({ base, devframes: [inspect, messages], ui: createUi() })` created inside `server.setup` in `rsbuild.config.ts` — lazily, so importing the config never spawns the hub's side-car, and reused across re-runs.
- `server.setup` registers `hub.nodeMiddleware`, which owns the `/__devframes/` namespace and hands everything else back to Rsbuild.
- Rsbuild's middleware stack never hands over upgrades, so `ws: { sidecar: true }` puts the RPC WebSocket on its own port, advertised through `<base>__connection.json`; `html.tags` injects the `${hub.base}embedded.js` bootstrap.

## Run it

```sh
pnpm install
pnpm --filter hub-rsbuild-minimal dev
```

Open the printed URL for the host page with the floating dock, or `/__devframes/` for the standalone viewer.

## Source

[`examples/hub-rsbuild-minimal`](https://github.com/devframes/devframe/tree/main/examples/hub-rsbuild-minimal)
