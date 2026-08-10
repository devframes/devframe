---
outline: deep
---

# hub-hono-minimal

The minimal [Hono](https://hono.dev) host for [`@devframes/hub`](/guide/hub): one `initHub()` call behind a catch-all route, running on **Node and Bun** from the same app file, the UI supplied by `@devframes/hub-ui`.

Package: `hub-hono-minimal` · framework: **Hono**

## What it shows

- `initHub({ base, devframes: [inspect, messages], ui: createUi() })` in `src/app.ts` plus `app.all(\`${hub.base}*\`, c => hub.handler(c.req.raw, c.env))`.
- On Node (`@hono/node-server`), the RPC WebSocket runs on an eager side-car port.
- On Bun (`Bun.serve({ fetch, websocket: hub.websocket })`), WebSocket upgrades complete through `hub.handler(request, server)` on the app's own origin — no side-car. The repo's `scripts/smoke-bun.ts` exercises this path end to end.

## Run it

```sh
pnpm install
pnpm --filter hub-hono-minimal dev       # Node
pnpm --filter hub-hono-minimal dev:bun   # Bun
```

## Source

[`examples/hub-hono-minimal`](https://github.com/devframes/devframe/tree/main/examples/hub-hono-minimal)
