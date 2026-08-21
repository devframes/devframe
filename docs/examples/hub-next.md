---
outline: deep
---

# hub-next

The [Vite host](./hub-vite)'s protocol from a **Next.js** App Router app with a hand-built React viewer, proving host-runtime-agnosticism.

Package: `hub-next` · framework: **React (Next.js)**

## What it proves

- `initHub({ base, devframes, configure })` boots the hub; a catch-all route (`app/%5F_devframes/[[...path]]/route.ts`) delegates to `hub.handler(request)`.
- `ws: { sidecar: true }` gives the socket its own port (Next route handlers reject upgrades) via `<base>__connection.json`; memoized on `globalThis` across reloads.
- **Registry replacement** for [JSON-render](/guide/json-render): the React client renders with its own registry, not `@devframes/json-render-ui`.
- [Client-only docks](/guide/client-context#client-only-docks) via `context.docks.register()`.

Minimal counterpart (`@devframes/hub-ui` viewer): [hub-next-minimal](./hub-next-minimal).

## Run it

```sh
pnpm install
pnpm --filter hub-next dev
```

Open the printed URL for the hub.

## Source

[`examples/hub-next`](https://github.com/devframes/devframe/tree/main/examples/hub-next)
