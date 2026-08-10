---
outline: deep
---

# hub-vite-minimal

The minimal [Vite](https://vite.dev) host for [`@devframes/hub`](/guide/hub): one `initHub()` call mounted as dev middleware, the UI supplied by `@devframes/hub-ui`. No hand-built viewer — the whole integration is the config file.

Package: `hub-vite-minimal` · framework: **Vite**

## What it shows

- `initHub({ base, devframes: [inspect, messages], ui: createUi() })` in `vite.config.ts` — runs in Vite's Node config process, never bundled into the browser.
- `server.middlewares.use(hub.nodeMiddleware)` mounts the whole `/__devframes/` namespace; the WebSocket upgrade shares Vite's own server at `<base>__ws`.
- `transformIndexHtml` injects `<script type="module" src="${hub.base}embedded.js">`, so the floating dock mounts itself on the host page.

## Run it

```sh
pnpm install
pnpm --filter hub-vite-minimal dev
```

Open the printed URL for the host page with the floating dock, or `/__devframes/` for the standalone viewer.

## Source

[`examples/hub-vite-minimal`](https://github.com/devframes/devframe/tree/main/examples/hub-vite-minimal)
