# hub-deno-minimal

The minimal [Deno](https://deno.com) host for `@devframes/hub`: one `initHub()` call served through `Deno.serve`, with the RPC socket riding a same-origin fetch upgrade.

```sh
pnpm --filter hub-deno-minimal dev
```

Open <http://localhost:5182> (the host page carries the floating dock via one script tag) or <http://localhost:5182/__devframes/> for the standalone hub UI.

## How it works

- [`src/hub.ts`](./src/hub.ts): `initHub({ devframes, ui: createUi({ branding }) })` (rebranded to Deno's own green, `#70ffaf`), memoized on `globalThis` so a dev-time reload reuses the live hub. No `ws` option is passed, so the entry wires the socket itself.
- [`src/server.ts`](./src/server.ts): Deno serves HTTP through `Deno.serve(options, handler)` (web `Request` → `Response`), and the whole namespace flows through `hub.handler(request)`. WebSockets arrive as fetch upgrades rather than `node:http` `upgrade` events, so the entry binds Deno's own transport to the hub context with `createContextRpcServer` + `attachDenoWsTransport` (crossws' Deno adapter) and answers `/__devframes/__ws` itself, so the socket rides the app's own origin with no side-car port. crossws attaches the socket to the `Response` its `handleUpgrade` returns, so there is no separate `websocket` handler object to register.

The same `initHub` instance mounts identically on Vite, Hono, Nitro, Fastify, and Next.js; see the sibling examples.
