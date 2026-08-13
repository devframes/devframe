# Next Devframe Hub

A tiny, copyable **vite-devtools-style hub on Next.js**. [vite-devtools](https://github.com/vitejs/devtools) is the full Vite viewer built on `@devframes/hub`; this example wears the same shape — an icon dock, an iframe stage, a subsystem drawer — but hosts it from a Next.js App Router app with one `initHub()` instance behind one catch-all route. It's the reference for bringing the same integrations to any non-Vite host.

`src/client/devframe/next-devframe-hub.ts` is the entire host: a single `initHub()` call from `@devframes/hub/initiate`.

## Run it

```sh
pnpm install
pnpm --filter hub-next dev
```

Open the printed URL. The dock on the left lists every mounted tool with its icon:

- **Git**, **Terminals**, **Code Server**, **RPC & State Inspector**, **A11y Inspector** — the built-in plugins, each an entry in `initHub`'s `devframes` list
- **Next Demo Tool** — a trivial static SPA that shows the bare mount path

Selecting a tool loads its SPA in the stage. The bottom drawer mirrors the hub's **Commands**, **Messages**, and **Terminals** subsystems, plus a button that dispatches a command through `hub:commands:execute`.

The A11y Inspector shows a live axe-core report of this hub's own page: the host serves the plugin's in-page agent module (`a11yAgentBundlePath`) same-origin inside the hub namespace and attaches it as the a11y dock's `clientScript` (the `{ devframe, dock }` entry form); the hub client runtime — `createDevframeClientHost()` booted in `app/page.tsx` — imports it into the page, so the docked panel and the agent share the origin their BroadcastChannel rides.

The **RPC & State Inspector** carries an **Instances** tab that lists every devframe dev server running on your machine. The host registers itself in the shared registry (`~/.devframe/instances/`) on startup via `registerDevframeInstance()`, so it shows up as "this instance"; start another example (e.g. `pnpm --filter hub-vite dev`, or any `node bin.mjs` CLI example) in a second terminal and it appears there too, each linking to its own SPA.

## One namespace, one route

`initHub()` answers everything under **`/__devframes/`** through a single web-standard `(request: Request) => Promise<Response>` handler — exactly the shape a Next App Router route handler returns. One optional catch-all route delegates to it:

- `/__devframes/<id>/` — each mounted devframe's SPA and its `__connection.json`
- `/__devframes/__connection.json` — hub discovery; advertises the side-car WebSocket (Next route handlers can't accept upgrades, so the hub asks for one with `ws: { sidecar: true }` and the meta carries its port)
- `/__devframes/__index.json` — the frame index and endpoint map
- `/__devframes/__client-imports.js` — the dock client-script import map
- `/__devframes/__mcp` — the aggregate MCP endpoint (Streamable-HTTP) over the whole hub tool registry

Next.js reserves `_`-prefixed segment folders, so the route directory URL-encodes the leading underscore: `app/%5F_devframes/[[...path]]/route.ts`.

The instance is memoized on `globalThis`, so Next's dev-time module re-evaluation reuses the live hub instead of leaking side-car servers.

## What the example proves

- `initHub()` boots a whole hub with no Vite-specific code path — devframes, shared RPC registry, WS transport, MCP, and discovery behind one framework-agnostic handler
- Every `devframes` entry is mounted as a dock and served at `/__devframes/<id>/` with its own `__connection.json`, so the embedded SPA connects straight back to the hub
- The browser reads `devframe:docks` / `devframe:commands` shared state and dispatches commands over RPC — byte-for-byte the same protocol the Vite host speaks
- `createDevframeClientHost()` boots the hub's framework-level client runtime in the host page: it publishes the shared client context and imports each dock's `clientScript` (here, the a11y agent) so plugins run code in the page being inspected
- The **JSON Render** dock renders through a **local React renderer** (`src/client/json-render/react-renderer.tsx` — a compact React port of the base catalog) registered at `createDevframeClientHost({ renderers })`. The hub *also* publishes the reference Vue frontend through its renderer manifest (`renderers: [jsonRenderUiRenderer()]` on `initHub`), but local registration takes precedence — witnessing that any frontend implementing the `JsonRenderDockRenderer` contract can replace the reference one. Delete the local `renderers` option and the same dock renders via the manifest-served module instead. (The sibling `hub-vite` witness ships no local renderer and consumes the manifest directly — the other side of the swap seam.)
- The **No Renderer** dock witnesses the missing-renderer path: its type is covered by nothing, so `renderers.mount()` resolves `{ status: 'missing-renderer' }` and the shell shows *No renderer for "demo-unrendered" in the current environment* instead of a dead panel

## Hosting built-in plugins in a bundler

The plugins run node-side (child processes, the native `zigpty` PTY backend) and resolve their SPA dist via `new URL(..., import.meta.url)`. Next's bundler would try to inline that, so the host loads them through a bundler-ignored dynamic `import()` and sets `skipTrailingSlashRedirect` (see `next.config.mjs`) so each SPA's relative assets resolve under `/__devframes/<id>/`. This is the recipe for any bundled (webpack/Turbopack) host.

## Files

| File | Role |
|---|---|
| `src/client/devframe/next-devframe-hub.ts` | The Next host — one `initHub()` call: devframes (incl. the a11y agent's dock `clientScript`), hub RPCs, commands, the json-render dock + renderer manifest, instance-registry registration |
| `src/client/devframe/unrendered-dock.ts` | A dock type registered with no renderer on purpose — the missing-renderer fallback witness |
| `src/client/app/%5F_devframes/[[...path]]/route.ts` | The one catch-all — delegates every `/__devframes/*` request to the instance's `handler` |
| `src/client/app/page.tsx` | The browser UI that consumes the hub protocol |
| `src/client/app/icons.ts` | Offline Phosphor icons for the dock |
