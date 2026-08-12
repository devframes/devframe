---
outline: deep
---

# hub-next-minimal

The minimal [Next.js](https://nextjs.org) host for [`@devframes/hub`](/guide/hub): one `initHub()` call on an App Router catch-all route, the UI supplied by `@devframes/hub-ui`.

Package: `hub-next-minimal` · framework: **React (Next.js)**

## What it shows

- `initHub({ base, devframes: [inspect, messages], ui: createUi() })` behind one route (`app/%5F_devframes/[[...path]]/route.ts`) delegating to `hub.handler(request)`.
- The plugins and `@devframes/hub-ui` load via a bundler-ignored dynamic `import()`, so Next resolves their published `dist` at runtime (their `import.meta.url` asset lookups don't survive static bundling).
- Next route handlers can't accept WebSocket upgrades, so `ws: { sidecar: true }` gives the socket its own port, advertised through `<base>__connection.json`; the instance is memoized on `globalThis` so a dev-time reload reuses it.

## Run it

```sh
pnpm install
pnpm --filter hub-next-minimal dev
```

Open the printed URL for the host page with the floating dock, or `/__devframes/` for the standalone viewer.

## Source

[`examples/hub-next-minimal`](https://github.com/devframes/devframe/tree/main/examples/hub-next-minimal)
