# hub-vite-minimal

The minimal [Vite](https://vite.dev) host for `@devframes/hub`: one `initHub()` call mounted as dev middleware, the UI supplied by `@devframes/hub-ui`.

```sh
pnpm --filter hub-vite-minimal dev
```

Open the printed URL - the host page carries the floating dock via one injected script tag - or `/__devframes/` for the standalone hub UI.

## How it works

[`vite.config.ts`](./vite.config.ts) is the entire host-framework integration:

- `initHub({ devframes: [inspect, messages], ui: createUi({ branding }) })` runs in Vite's Node config process (never bundled into the browser), so `createUi()`'s prebuilt standalone UI + floating dock and the devframes' node code work unchanged. `branding.primaryColor` is Vite's own purple (`#646cff`), so a rebrand reaches every `primary`-based color in the dock, no CSS required.
- `server.middlewares.use(hub.nodeMiddleware)` mounts the whole `/__devframes/` namespace; the middleware self-filters by base and hands everything else back to Vite.
- The RPC WebSocket shares Vite's own dev server at `/__devframes/__ws` - zero extra ports.
- `transformIndexHtml` injects `<script type="module" src="/__devframes/embedded.js">` into the host page, so the floating dock mounts itself.

The same `initHub` instance mounts identically on Nitro, Hono, Next.js, and Rsbuild - see the sibling `hub-*-minimal` examples.
