---
outline: deep
---

# hub-vite

A protocol-witness host: a small Vite plugin that wires [`@devframes/hub`](/guide/hub) into a Vite dev server with **one `initHub()` call** and a hand-built **vanilla TypeScript** viewer, so nothing distracts from the hub protocol itself. Every framework's hub host follows the same shape.

Package: `hub-vite` · framework: **Vanilla TypeScript (Vite)**

## What it proves

- `initHub({ base, devframes, configure })` boots the whole hub — merged RPC registry, shared state, docks/terminals/messages/commands — from one call, mounted as connect middleware (`server.middlewares.use(hub.nodeMiddleware)`).
- The WebSocket RPC upgrade shares Vite's own dev server at `<base>__ws` — zero extra ports.
- The browser viewer connects via `connectDevframe({ baseURL: hub.base })`, discovering the endpoint through the hub's `__connection.json`.
- The opt-in [JSON-render](/guide/json-render) hub integration end to end, plus [client-only docks](/guide/client-context#client-only-docks) the page registers itself with `context.docks.register()`.

For the minimal counterpart — the hub UI supplied by `@devframes/hub-ui` instead of a hand-built viewer — see [hub-vite-minimal](./hub-vite-minimal).

## Run it

```sh
pnpm install
pnpm --filter hub-vite dev
```

Open the printed URL to see the docks, commands, messages, and terminals the hub exposes.

## Source

[`examples/hub-vite`](https://github.com/devframes/devframe/tree/main/examples/hub-vite)
