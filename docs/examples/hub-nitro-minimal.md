---
outline: deep
---

# hub-nitro-minimal

The minimal [Nitro](https://nitro.build) host for [`@devframes/hub`](/guide/hub): one `initHub()` call behind a catch-all route, the UI supplied by `@devframes/hub-ui`.

Package: `hub-nitro-minimal` · framework: **Nitro**

## What it shows

- `initHub({ base, devframes: [inspect, messages], ui: createUi() })` in `hub.ts`, delegated to by a catch-all route (`routes/__devframes/[...path].ts`, plus its `index.ts` sibling for the namespace root) via `hub.handler(event.req)`.
- `nitro.config.ts` keeps the devframe packages external so their prebuilt client assets resolve from the packages themselves rather than Nitro's build output.
- Nitro handlers hand over `Request`s, so `ws: { sidecar: true }` puts the RPC WebSocket on its own port, advertised through `<base>__connection.json`.

## Run it

```sh
pnpm install
pnpm --filter hub-nitro-minimal dev
```

Open the printed URL for the host page with the floating dock, or `/__devframes/` for the standalone viewer.

## Source

[`examples/hub-nitro-minimal`](https://github.com/devframes/devframe/tree/main/examples/hub-nitro-minimal)
