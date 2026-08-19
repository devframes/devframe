# hub-fastify-minimal

The minimal [Fastify](https://fastify.dev) host for `@devframes/hub` — one `initHub()` call mounted through Fastify's connect-middleware layer, with the RPC socket riding Fastify's own HTTP server.

```sh
pnpm --filter hub-fastify-minimal dev
```

Open <http://localhost:5183> — the host page carries the floating dock via one script tag — or <http://localhost:5183/__devframes/> for the standalone viewer.

## How it works

- [`src/hub.ts`](./src/hub.ts) — `initHub({ devframes, ui: createUi({ branding }) })` (rebranded to Fastify's own black, `#2f2f2f`), memoized on `globalThis` so a dev-time reload reuses the live hub. No `ws` option is passed, so the hub binds nothing on its own.
- [`src/server.ts`](./src/server.ts) — Fastify is the `nodeMiddleware` host: rather than bridging every request to `hub.handler`, it registers `hub.nodeMiddleware` — the same `(req, res, next)` shape a Vite dev server consumes — through [`@fastify/middie`](https://github.com/fastify/middie). Requests under `/__devframes/` are served by the hub; everything else falls through `next()` to Fastify's own routes. The RPC socket rides Fastify's own `node:http` server: `fastify.server` is that server, and `hub.attach(server)` routes its upgrade events to `/__devframes/__ws` on the app's origin — no side-car port.

The same `initHub` instance mounts identically on Vite, Hono, Nitro, and Next.js — see the sibling examples.
