---
outline: deep
---

# hub-sveltekit-minimal

The minimal [SvelteKit](https://svelte.dev/docs/kit) host for [`@devframes/hub`](/guide/hub): one `initHub()` call behind a single catch-all endpoint, the UI supplied by `@devframes/hub-ui`.

Package: `hub-sveltekit-minimal` · framework: **SvelteKit**

## What it shows

- `initHub({ base, devframes, ui: createUi() })` in `src/hub.ts`, memoized on `globalThis`. The RPC socket runs on a side-car port (`ws: { sidecar: true }`) advertised via `__connection.json` — SvelteKit's `+server.ts` handlers hand over `Request`s and never see WebSocket upgrades, so the hub takes a socket of its own.
- `src/routes/__devframes/[...path]/+server.ts` mounts the whole namespace: `fallback` answers every method with `hub.handler(event.request)`, and the `[...path]` rest param matches the namespace root as well as everything beneath it.
- The endpoint exports `trailingSlash = 'ignore'` so SvelteKit serves the hub's trailing-slash URLs (the standalone viewer and each frame SPA) verbatim instead of 308-redirecting them, and `src/app.html` injects `${hub.base}embedded.js` to mount the floating dock.

## Run it

```sh
pnpm install
pnpm --filter hub-sveltekit-minimal dev
```

## Source

[`examples/hub-sveltekit-minimal`](https://github.com/devframes/devframe/tree/main/examples/hub-sveltekit-minimal)
