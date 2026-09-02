# hub-sveltekit-minimal

The minimal [SvelteKit](https://svelte.dev/docs/kit) host for `@devframes/hub`: one `initHub()` call behind a single catch-all endpoint, the whole devtools installation live under `/__devframes/`.

```sh
pnpm --filter hub-sveltekit-minimal dev
```

Open <http://localhost:5173> - the host page carries the floating dock via one script tag - or <http://localhost:5173/__devframes/> for the standalone hub UI.

## How it works

- [`src/hub.ts`](./src/hub.ts) - `initHub({ devframes, ui: createUi({ branding }) })` (rebranded to Svelte's own orange, `#ff3e00`), memoized on `globalThis` so SvelteKit's dev-time reload reuses the live hub. The RPC socket runs on a side-car port (`ws: { sidecar: true }`) advertised via `__connection.json` - SvelteKit's `+server.ts` handlers hand over `Request`s and never see WebSocket upgrades, so the hub takes a socket of its own; the browser client discovers it automatically.
- [`src/routes/__devframes/[...path]/+server.ts`](./src/routes/__devframes/%5B...path%5D/+server.ts) - the whole namespace behind one catch-all: `fallback` answers every method with `hub.handler(event.request)`, web-standard `Request` in, `Response` out. Its `[...path]` rest param matches the namespace root (`/__devframes/`) as well as everything beneath it. It exports `trailingSlash = 'ignore'` so SvelteKit serves the hub's trailing-slash URLs (the standalone hub UI and each mounted devframe's SPA) verbatim instead of 308-redirecting them.
- [`src/app.html`](./src/app.html) injects `/__devframes/embedded.js` - the one script tag that mounts the floating dock on every page.

The same `initHub` instance mounts identically on Vite, Hono, Nitro, Fastify, and Next.js - see the sibling examples.
