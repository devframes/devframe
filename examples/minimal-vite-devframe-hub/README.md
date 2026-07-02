# Minimal Vite Devframe Hub

A tiny, copyable **vite-devtools-style hub**. [vite-devtools](https://github.com/vitejs/devtools) is the full viewer that docks many Vite integrations behind one icon rail on top of `@devframes/hub`; this example is the smallest thing shaped like it — an icon dock, an iframe stage, and a drawer of hub subsystems — so you can see the whole protocol and build your own viewer from it.

`src/minimal-vite-devframe-hub.ts` is the entire host: ~120 lines of Vite plugin that wires `@devframes/hub` into a Vite dev server. Every framework's hub host follows the same shape.

## Run it

```sh
pnpm install
pnpm --filter minimal-vite-devframe-hub dev
```

Open the printed URL. The dock on the left lists every mounted tool with its icon:

- **Git**, **Terminals**, **Code Server**, **RPC & State Inspector**, **A11y Inspector** — the built-in plugins, each a published `DevframeDefinition` mounted with `mountDevframe`
- **Demo Tool** / **Demo Tool B** — two trivial static SPAs that show the bare mount path

Selecting a tool loads its SPA in the stage. The bottom drawer mirrors the hub's **Commands**, **Messages**, and **Terminals** subsystems, plus a button that dispatches a command through `hub:commands:execute`.

The A11y Inspector shows a live axe-core report of this hub's own page. `vite.config.ts` attaches the plugin's in-page agent as the a11y dock's `clientScript` (served via `/@fs/`), and the hub client runtime — `createDevframeClientHost()` booted in `src/client/main.ts` — imports it into the host page. Panel and agent share the Vite origin their BroadcastChannel rides; hover a violation to ring the offending element in the hub UI.

## What the example proves

- `createHubContext()` boots a hub with no Vite-specific code path; a `DevframeHost` impl plugs framework specifics (static mounts, connection meta, storage, origin) in uniformly
- `mountDevframe(ctx, def)` registers any `DevframeDefinition` as a dock and serves both its SPA and its `__connection.json`, so the embedded SPA connects straight back to the hub
- Real integrations work end to end through the mount path — the inspector lists every plugin's RPC functions live, terminals stream over the hub, and code-server launches an authenticated editor
- The browser reads `devframe:docks` / `devframe:commands` shared state and dispatches commands over RPC — no hub classes imported on the client
- `createDevframeClientHost()` boots the hub's framework-level client runtime in the host page: it publishes the shared client context and imports each dock's `clientScript` (here, the a11y agent) so plugins run code in the page being inspected

## Build your own

The dock UI is plain DOM in `src/client/`. To skin your own viewer, read the same shared-state keys and render them however you like; swap the inline `icons.ts` for your framework's icon component (UnoCSS `preset-icons`, `@iconify/vue`, …). The host file is the part worth copying verbatim.

## Files

| File | Role |
|---|---|
| `src/minimal-vite-devframe-hub.ts` | The Vite host — hub context, static + connection-meta mounts, side-car WS |
| `vite.config.ts` | Mounts the built-in plugins via the host's `devframes` option; attaches the a11y agent as its dock's `clientScript` |
| `src/client/main.ts` | The browser UI that consumes the hub protocol |
| `src/client/icons.ts` | Offline Phosphor icons for the dock |
| `index.html` | The UI shell |
