---
outline: deep
---

# minimal-vite-devframe-hub

A protocol-witness host: roughly 120 lines of Vite plugin code that wire [`@devframes/hub`](/guide/hub) into a Vite dev server. The browser UI is plain **vanilla TypeScript**, so nothing distracts from the hub protocol itself. Every framework's hub host follows the same shape.

Package: `minimal-vite-devframe-hub` · framework: **Vanilla TypeScript (Vite)**

## What it proves

- `createHubContext()` boots a hub without any Vite-specific code path.
- A `DevframeHost` implementation plugs framework specifics (storage paths, origin resolution) into the hub uniformly.
- `mountDevframe(ctx, def)` registers any `DevframeDefinition` as a dock.
- The built-in `hub:commands:execute` RPC dispatches any registered server command, regardless of how the host was constructed.
- The browser-side `connectDevframe({ baseURL: '/__hub/' })` discovers the WS endpoint via the kit's `__connection.json` middleware.

## Run it

```sh
pnpm install
pnpm --filter minimal-vite-devframe-hub dev
```

Open the printed URL to see the docks, commands, messages, and terminals lists the hub exposes, plus a button that dispatches a sample command through `hub:commands:execute`.

## Source

[`examples/minimal-vite-devframe-hub`](https://github.com/devframes/devframe/tree/main/examples/minimal-vite-devframe-hub)
