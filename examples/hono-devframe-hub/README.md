# hono-devframe-hub

The minimal [Hono](https://hono.dev) host for `@devframes/hub` — one `initHub()` call, one catch-all route, and the same app file runs on Node and Bun.

```sh
pnpm --filter hono-devframe-hub dev       # Node (tsx)
pnpm --filter hono-devframe-hub dev:bun   # Bun
```

Open <http://localhost:5179> — the host page carries the floating dock via one script tag — or <http://localhost:5179/__devframes/> for the standalone viewer.

## How it works

- [`src/app.ts`](./src/app.ts) — runtime-agnostic: `initHub({ devframes, ui: createUi(), key })` plus `app.all('/__devframes/*', c => hub.handler(c.req.raw, c.env))`. Everything — frame SPAs, `__connection.json`, `__index.json`, `embedded.js`, `__client-imports.js` — flows through that one route.
- [`src/node.ts`](./src/node.ts) — `@hono/node-server`; the RPC WebSocket runs on an eager side-car port, advertised through `__connection.json`.
- [`src/bun.ts`](./src/bun.ts) — `Bun.serve({ fetch: app.fetch, websocket: hub.websocket })`; WebSocket upgrades complete through `hub.handler(request, server)` on the app's own origin — no side-car.

The Bun path is exercised end to end by the repo's smoke script:

```sh
bun scripts/smoke-bun.ts
```
