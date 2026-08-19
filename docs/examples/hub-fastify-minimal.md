---
outline: deep
---

# hub-fastify-minimal

The minimal [Fastify](https://fastify.dev) host for [`@devframes/hub`](/guide/hub): one `initHub()` call mounted through Fastify's connect-middleware layer, the UI supplied by `@devframes/hub-ui`.

Package: `hub-fastify-minimal` · framework: **Fastify**

## What it shows

- `initHub({ base, devframes, ui: createUi() })` in `src/hub.ts`, memoized on `globalThis`. No transport option, so the socket rides Fastify's own server.
- Fastify is the `nodeMiddleware` host: `src/server.ts` registers `hub.nodeMiddleware` — the same `(req, res, next)` shape Vite's dev server consumes — through [`@fastify/middie`](https://github.com/fastify/middie). Requests under `${hub.base}` are served by the hub; the rest fall through `next()` to Fastify's routes.
- `hub.attach(fastify.server)` routes the HTTP server's upgrade events to the RPC socket at `${hub.base}__ws`, on the app's own origin — no side-car port.

## Run it

```sh
pnpm install
pnpm --filter hub-fastify-minimal dev
```

## Source

[`examples/hub-fastify-minimal`](https://github.com/devframes/devframe/tree/main/examples/hub-fastify-minimal)
