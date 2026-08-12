# hub-rsbuild-minimal

The minimal [Rsbuild](https://rsbuild.dev) host for `@devframes/hub`: one `initHub()` call mounted into the dev server's middleware stack, the UI supplied by `@devframes/hub-ui`.

```sh
pnpm --filter hub-rsbuild-minimal dev
```

Open the printed URL — the host page carries the floating dock via one injected script tag — or `/__devframes/` for the standalone viewer.

## How it works

[`rsbuild.config.ts`](./rsbuild.config.ts) is the entire host:

- `initHub({ devframes: [inspect, messages], ui: createUi() })` runs in Rsbuild's Node config process (never bundled into the browser), so `createUi()`'s prebuilt viewer/dock and the plugins' node code work unchanged.
- `dev.setupMiddlewares` unshifts `hub.nodeMiddleware`, which owns the whole `/__devframes/` namespace and hands everything else back to Rsbuild.
- The RPC WebSocket runs on a side-car port (`ws: { sidecar: true }`, since Rsbuild's middleware stack never hands over upgrades), advertised through `__connection.json`; the browser client discovers it automatically.
- `html.tags` injects `<script type="module" src="/__devframes/embedded.js">`, so the floating dock mounts itself.

The same `initHub` instance mounts identically on Vite, Nitro, Hono, and Next.js — see the sibling `hub-*-minimal` examples.
