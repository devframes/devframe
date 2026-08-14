# hub-nitro-minimal

The minimal [Nitro](https://nitro.build) host for `@devframes/hub`: one `initHub()` call, one catch-all route, and the whole devtools installation is live under `/__devframes/`.

```sh
pnpm --filter hub-nitro-minimal dev
```

Open <http://localhost:3000> - the host page carries the floating dock via one script tag - or <http://localhost:3000/__devframes/> for the standalone viewer.

## How it works

- [`hub.ts`](./hub.ts) - `initHub({ devframes, ui: createUi({ branding }) })`: mounts the Inspect and Messages plugins against one shared hub context, fills the hub's `ui` slot with `@devframes/hub-ui`'s prebuilt viewer + floating-dock bootstrap (rebranded to Nitro's own pink/red, `#ff2056`), and memoizes the instance across Nitro's dev-time module reloads.
- [`routes/__devframes/[...path].ts`](./routes/__devframes/%5B...path%5D.ts) (and its `index.ts` sibling for the namespace root) - the delegation: every request under `/__devframes/` becomes `hub.handler(event.req)`, web-standard Request in, Response out. Everything - frame SPAs, `__connection.json`, `__index.json`, `embedded.js`, `__client-imports.js` - flows through it.
- [`nitro.config.ts`](./nitro.config.ts) - keeps the devframe packages external so their prebuilt client assets resolve from the packages themselves rather than Nitro's build output.
- The RPC WebSocket runs on a side-car port - Nitro handlers hand over `Request`s, so `ws: { sidecar: true }` asks for one - advertised through `__connection.json`; the browser client discovers it automatically.

The same `initHub` instance mounts identically on Vite, Hono, and Next.js - see the sibling examples.
