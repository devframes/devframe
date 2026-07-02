# Minimal Next Devframe Hub

A tiny, copyable **vite-devtools-style hub on Next.js**. [vite-devtools](https://github.com/vitejs/devtools) is the full Vite viewer built on `@devframes/hub`; this example wears the same shape — an icon dock, an iframe stage, a subsystem drawer — but hosts it from a Next.js App Router app, lazily starting a side-car RPC/WS server from a Node route handler. It's the reference for bringing the same integrations to any non-Vite host.

`src/client/devframe/minimal-next-devframe-hub.ts` is the entire host.

## Run it

```sh
pnpm install
pnpm --filter minimal-next-devframe-hub dev
```

Open the printed URL. The dock on the left lists every mounted tool with its icon:

- **Git**, **Terminals**, **Code Server**, **RPC & State Inspector**, **A11y Inspector** — the built-in plugins, each mounted with `mountDevframe`
- **Next Demo Tool** / **Next Demo Tool B** — two trivial static SPAs that show the bare mount path

Selecting a tool loads its SPA in the stage. The bottom drawer mirrors the hub's **Commands**, **Messages**, and **Terminals** subsystems, plus a button that dispatches a command through `hub:commands:execute`.

The A11y Inspector shows a live axe-core report of this hub's own page: the host serves the plugin's in-page agent module (`a11yAgentBundlePath`) same-origin through the catch-all route and attaches it as the a11y dock's `clientScript`; the hub client runtime — `createDevframeClientHost()` booted in `app/page.tsx` — imports it into the page, so the docked panel and the agent share the origin their BroadcastChannel rides.

## What the example proves

- `createHubContext()` boots a hub with no Vite-specific code path; a `DevframeHost` impl plugs Next specifics (static mounts, connection meta, storage, origin) in uniformly
- `mountDevframe(ctx, def)` registers any `DevframeDefinition` as a dock and serves both its SPA and its `__connection.json`, so the embedded SPA connects straight back to the hub
- The browser reads `devframe:docks` / `devframe:commands` shared state and dispatches commands over RPC — byte-for-byte the same protocol the Vite host speaks
- `createDevframeClientHost()` boots the hub's framework-level client runtime in the host page: it publishes the shared client context and imports each dock's `clientScript` (here, the a11y agent) so plugins run code in the page being inspected

## Hosting built-in plugins in a bundler

The plugins run node-side (child processes, the native `node-pty` PTY backend) and resolve their SPA dist via `new URL(..., import.meta.url)`. Next's bundler would try to inline that, so the host loads them through a bundler-ignored dynamic `import()` and sets `skipTrailingSlashRedirect` (see `next.config.mjs`) so each SPA's relative assets resolve under `/__<id>/`. This is the recipe for any bundled (webpack/Turbopack) host.

## Files

| File | Role |
|---|---|
| `src/client/devframe/minimal-next-devframe-hub.ts` | The Next host — hub context, static-mount registry (incl. the a11y agent), side-car WS |
| `src/client/app/%5F_hub/%5F_connection.json/route.ts` | Boots the singleton host and serves `/__hub/__connection.json` |
| `src/client/app/%5F_[id]/[[...path]]/route.ts` | Serves each mounted SPA and its connection meta under `/__<id>/` |
| `src/client/app/page.tsx` | The browser UI that consumes the hub protocol |
| `src/client/app/icons.ts` | Offline Phosphor icons for the dock |
