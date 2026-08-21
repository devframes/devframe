---
outline: deep
---

# hub-vite

A small Vite plugin wiring [`@devframes/hub`](/guide/hub) into a dev server with **one `initHub()` call** and a hand-built **vanilla TypeScript** viewer.

Package: `hub-vite` · framework: **Vanilla TypeScript (Vite)**

## What it proves

- `initHub({ base, devframes, configure })` boots the whole hub, mounted as connect middleware (`server.middlewares.use(hub.nodeMiddleware)`).
- The WebSocket RPC upgrade shares Vite's dev server at `<base>__ws`; no extra ports.
- The viewer connects via `connectDevframe({ baseURL: hub.base })`, discovered from `__connection.json`.
- Opt-in [JSON-render](/guide/json-render), plus [client-only docks](/guide/client-context#client-only-docks) via `context.docks.register()`.

Minimal counterpart (`@devframes/hub-ui` viewer): [hub-vite-minimal](./hub-vite-minimal).

## Run it

```sh
pnpm install
pnpm --filter hub-vite dev
```

Open the printed URL for the hub's docks and terminals.

## Source

[`examples/hub-vite`](https://github.com/devframes/devframe/tree/main/examples/hub-vite)
