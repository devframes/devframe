---
outline: deep
---

# minimal-next-devframe-hub

The same hub protocol as the [Vite host](./minimal-vite-devframe-hub), hosted from a **Next.js** App Router app. It wires [`@devframes/hub`](/guide/hub) by lazily starting a side-car RPC / WebSocket server from a Node route handler — proof that the hub is host-runtime-agnostic.

Package: `minimal-next-devframe-hub` · framework: **React (Next.js)**

## What it proves

- `createHubContext()` boots a hub without any Vite-specific code path.
- A `DevframeHost` implementation plugs the Next host specifics into the hub uniformly.
- `mountDevframe(ctx, def)` registers any `DevframeDefinition` as a dock.
- The built-in `hub:commands:execute` RPC dispatches any registered server command, regardless of how the host was constructed.
- The browser-side `connectDevframe({ baseURL: '/__hub/' })` discovers the WS endpoint via the Next route handler at `/__hub/__connection.json`, which starts the singleton host on demand.

## Run it

```sh
pnpm install
pnpm --filter minimal-next-devframe-hub dev
```

Open the printed URL to see the docks, commands, messages, and terminals lists, plus a button that dispatches a sample command through `hub:commands:execute`.

## Source

[`examples/minimal-next-devframe-hub`](https://github.com/devframes/devframe/tree/main/examples/minimal-next-devframe-hub)
