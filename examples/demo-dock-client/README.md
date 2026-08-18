# Demo Dock Client

The shared dock client script the two reference hubs consume in their two supported shapes — one package, both `importFrom` forms:

- **`hub-vite`** registers it by **bare specifier** (`action: { importFrom: 'demo-dock-client' }`). The Vite host advertises `clientModuleResolution: '/@id/{specifier}'` (the `@devframes/vite/hub` default), so the client host imports `dist/index.mjs` through Vite's own module graph — its bare `nanoevents` import resolves there too.
- **`hub-next`** mounts the prebuilt **self-contained bundle** (`dist/bundle.mjs`, nanoevents inlined) statically and passes the served URL. Next declares no `clientModuleResolution`, so the URL shape is the supported one there.

The script itself demonstrates the state pattern bare-specifier plugins should follow: shared state anchored on `globalThis` (`__devframes_demo_dock_client__`), the same design as `vite-plugin-vue-tracer`'s `__vue_tracer__` store — realm identity is the contract, module identity is best-effort. On each dock activation it bumps the shared counter and reports into the hub's messages feed, naming the URL it was loaded from.

## Entries

| Entry | Built as | Role |
|---|---|---|
| `demo-dock-client` | `dist/index.mjs` (deps external) | Bare-specifier consumption through a host's module graph |
| — | `dist/bundle.mjs` (self-contained) | URL consumption on hosts without bare-specifier resolution |
| `demo-dock-client/node` | `dist/node.mjs` | Node helper exporting `demoDockClientBundlePath` for static mounting |
