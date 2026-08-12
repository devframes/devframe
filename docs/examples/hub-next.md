---
outline: deep
---

# hub-next

The same hub protocol as the [Vite host](./hub-vite), hosted from a **Next.js** App Router app with a hand-built React viewer — proof that the hub is host-runtime-agnostic.

Package: `hub-next` · framework: **React (Next.js)**

## What it proves

- `initHub({ base, devframes, configure })` boots the whole hub from one call; a single App Router catch-all route (`app/%5F_devframes/[[...path]]/route.ts`) delegates to `hub.handler(request)`.
- Next route handlers can't accept WebSocket upgrades, so `ws: { sidecar: true }` gives the socket its own port, advertised through `<base>__connection.json`; the instance is memoized on `globalThis` so a dev-time reload reuses it.
- The [JSON-render](/guide/json-render) hub integration with **registry replacement**: the React client renders the server-authored view with a small in-example React registry (rather than the Vue `@devframes/json-render-ui`) — the path a non-Vue host uses.
- [Client-only docks](/guide/client-context#client-only-docks) the page registers itself with `context.docks.register()`.

For the minimal counterpart — the hub UI supplied by `@devframes/hub-ui` instead of a hand-built viewer — see [hub-next-minimal](./hub-next-minimal).

## Run it

```sh
pnpm install
pnpm --filter hub-next dev
```

Open the printed URL to see the docks, commands, messages, and terminals the hub exposes.

## Source

[`examples/hub-next`](https://github.com/devframes/devframe/tree/main/examples/hub-next)
