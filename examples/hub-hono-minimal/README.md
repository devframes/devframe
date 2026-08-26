# hub-hono-minimal

The minimal [Hono](https://hono.dev) host for `@devframes/hub` — one `initHub()` call, one catch-all route, and the same app file runs on Node and Bun.

```sh
pnpm --filter hub-hono-minimal dev       # Node (tsx)
pnpm --filter hub-hono-minimal dev:bun   # Bun
```

Open <http://localhost:5179> — the host page carries the floating dock via one script tag — or <http://localhost:5179/__devframes/> for the standalone viewer.

## How it works

- [`src/app.ts`](./src/app.ts) — runtime-agnostic: `initHub({ devframes, ui: createUi({ branding }) })` (rebranded to Hono's own orange, `#e36002`) plus `app.all('/__devframes/*', c => hub.handler(c.req.raw))`. Everything — the mounted devframes' SPAs, `__connection.json`, `__index.json`, `embedded.js`, `__client-imports.js` — flows through that one route. The instance is memoized on `globalThis` so a dev-time reload reuses the live hub. It configures no WebSocket transport, so each entry below wires the socket its runtime's way; both end up serving `/__devframes/__ws` on the app's own origin, which is what the hub advertises either way.
- [`src/server.ts`](./src/server.ts) — Node: `@hono/node-server`'s `serve()` returns the `node:http` server, and `hub.attach(server)` routes its upgrade events to the shared RPC socket.
- [`src/bun.ts`](./src/bun.ts) — Bun: upgrades arrive as fetch requests, so this entry binds Bun's own transport to the hub context with `createContextRpcServer` + `attachBunWsTransport` and answers the upgrade route inside `Bun.serve({ fetch, websocket })`.

The Bun path is exercised end to end by the repo's smoke script:

```sh
bun scripts/smoke-bun.ts
```
