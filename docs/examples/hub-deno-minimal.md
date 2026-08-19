---
outline: deep
---

# hub-deno-minimal

The minimal [Deno](https://deno.com) host for [`@devframes/hub`](/guide/hub): one `initHub()` call served through `Deno.serve`, the UI supplied by `@devframes/hub-ui`.

Package: `hub-deno-minimal` · framework: **Deno**

## What it shows

- `initHub({ base, devframes, ui: createUi() })` in `src/hub.ts`, memoized on `globalThis`. No transport option, so the entry wires the socket itself.
- `Deno.serve(options, handler)` serves HTTP (web `Request` → `Response`), and the whole namespace flows through `hub.handler(request)`.
- WebSockets arrive as fetch upgrades, so `src/server.ts` binds Deno's transport with `createContextRpcServer` + `attachDenoWsTransport` (crossws' Deno adapter) and answers `${hub.base}__ws` on the app's own origin. crossws attaches the socket to the `Response` its `handleUpgrade` returns, so there is no separate `websocket` handler object.

## Run it

```sh
pnpm install
pnpm --filter hub-deno-minimal dev
```

## Source

[`examples/hub-deno-minimal`](https://github.com/devframes/devframe/tree/main/examples/hub-deno-minimal)
