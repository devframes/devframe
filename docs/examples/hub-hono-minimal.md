---
outline: deep
---

# hub-hono-minimal

The minimal [Hono](https://hono.dev) host for [`@devframes/hub`](/guide/hub): one `initHub()` call behind a catch-all route, running on **Node and Bun** from the same app file, the UI supplied by `@devframes/hub-ui`.

Package: `hub-hono-minimal` · framework: **Hono**

## What it shows

- `initHub({ base, devframes: [inspect, messages], ui: createUi() })` in `src/app.ts` plus `app.all(\`${hub.base}*\`, c => hub.handler(c.req.raw))`. No transport option, so each runtime's entry wires the socket its own way — both landing on `${hub.base}__ws`, the app's own origin.
- On Node (`src/server.ts`), `@hono/node-server`'s `serve()` returns the `node:http` server and `hub.attach(server)` takes its upgrade events.
- On Bun (`src/bun.ts`), upgrades arrive as fetch requests, so the entry binds Bun's transport with `createContextRpcServer` + `attachBunWsTransport` inside `Bun.serve({ fetch, websocket })`. The repo's `scripts/smoke-bun.ts` exercises this path end to end.

## Run it

```sh
pnpm install
pnpm --filter hub-hono-minimal dev       # Node
pnpm --filter hub-hono-minimal dev:bun   # Bun
```

## Source

[`examples/hub-hono-minimal`](https://github.com/devframes/devframe/tree/main/examples/hub-hono-minimal)
