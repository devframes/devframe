---
outline: deep
---

# Hub

`@devframes/hub` extends devframe with the orchestration features that only make sense when many devtools share a UI: a dock registry, terminal aggregation, message/toast queue, and a command palette. It does not ship UI — each framework kit (e.g. `@vitejs/devtools-kit`) provides its own UI on top of the hub's RPC + shared-state protocol.

## What the hub adds

A hub-aware node context (`DevframeHubContext`) extends `DevframeNodeContext` with four subsystems:

| Subsystem | Surface | Purpose |
|---|---|---|
| `ctx.docks` | `register / update / values / activate` | Multi-tool dock entries (iframes, launchers, json-render, custom-render) and groups that collapse them under one button. `activate(dockId, params?)` steers which dock the viewer shows — see [Cross-iframe dock activation](#cross-iframe-dock-activation). |
| `ctx.terminals` | `register / startChildProcess` | Aggregate terminal sessions, stream output over a well-known channel. The single source of truth for "what sessions exist" — see [Terminals](/plugins/terminals#hub-aggregation) for how the terminals plugin renders and mirrors into it. |
| `ctx.messages` | `add / update / remove / clear` | Server-side toast/notification queue (FIFO, capped at 1000). |
| `ctx.commands` | `register / execute / list` | Hierarchical command palette with keybindings and `when` clauses. |

Plus a `createJsonRenderer(spec)` factory for building remote-UI panels via the framework-neutral json-render DSL.

## Built-in RPC

Every hub context auto-registers these RPC functions so framework kits don't reimplement them:

- `hub:commands:execute` — invoke a registered server command by id. `await rpc.call('hub:commands:execute', 'my-tool:do-thing', ...args)`.
- `hub:docks:activate` — switch the viewer's active dock. `await rpc.call('hub:docks:activate', { dockId, params })` — see [Cross-iframe dock activation](#cross-iframe-dock-activation).

Host-specific capabilities (open in editor, reveal in finder, …) ship as kit-registered RPC functions rather than as part of the hub surface.

## Cross-iframe dock activation

The viewer's active dock is client-local state — which dock is on screen lives in the shell page, not in shared state. A mounted devframe runs in its own iframe on its own RPC client, so it can't reach that selection directly. `hub:docks:activate` bridges the gap: any connected client asks the hub to switch the active dock, and the hub relays the request to the shell.

```ts
// From inside a mounted devframe's iframe (its own RPC client):
await rpc.call('hub:docks:activate', {
  dockId: 'devframes-plugin-terminals',
  params: { sessionId }, // opaque bag the target dock interprets
})
```

The hub broadcasts the request live over `devframe:docks:activate` (the client host calls its local `switchEntry(dockId)`) and mirrors it into the `devframe:docks:active` shared-state slot, so a dock that mounts *because* of the switch still converges on the request instead of missing the broadcast. `params` is an opaque, serializable bag the target dock reads — the [terminals dock](/plugins/terminals#focusing-a-session) reads `params.sessionId` to focus a specific session. Unknown dock ids degrade to a no-op (warned server-side as [DF8107](/errors/DF8107)); the target dock ignores `params` it doesn't recognize.

This is what lets Vite DevTools' Rolldown analyzer spawn a `vite build` via `ctx.terminals.startChildProcess` and then navigate the user straight to that build's terminal session.

Server-side, the same switch is available as `ctx.docks.activate(dockId, params?)`.

## Mounting a devframe into a hub

`mountDevframe(ctx, def)` is the framework-neutral primitive that registers any `DevframeDefinition` as a dock and runs its `setup(ctx)`:

```ts
import { createHubContext, mountDevframe } from '@devframes/hub/node'

const ctx = await createHubContext({ cwd, host, mode: 'dev' })
await mountDevframe(ctx, myDevframe)
```

Framework kits typically wrap this in a plugin shell. `@vitejs/devtools-kit`'s `createPluginFromDevframe` returns a Vite `Plugin` whose `devtools.setup` calls into `mountDevframe`.

### Connecting embedded SPAs

A mounted devframe's SPA loads in an iframe at its base (`/__<id>/`) and calls `connectDevframe()`, which fetches `./__connection.json` relative to that base. `mountDevframe` serves it there by calling the host's `mountConnectionMeta(base)` alongside `mountStatic`, so the SPA discovers the RPC/WS endpoint directly. Implement `mountConnectionMeta` on your `DevframeHost` to serve the same connection meta you expose at the hub's own base:

```ts
const host: DevframeHost = {
  mountStatic(base, distDir) { /* serve files */ },
  mountConnectionMeta(base) {
    // serve `${base}__connection.json` → { backend: 'websocket', websocket: port }
  },
  resolveOrigin() { /* … */ },
  getStorageDir(scope) { /* … */ },
}
```

A host that omits `mountConnectionMeta` while mounting a devframe with a servable `distDir` triggers a [`DF8106`](https://devfra.me/errors/DF8106) diagnostic and falls back to same-origin window inheritance, which connects an embedded SPA only when it shares an origin with the hub UI. When the hub mounts several devframe SPAs at different bases in the same page, inheritance still works: the connection meta is published together with the base it was resolved against, so each same-origin child resolves the RPC/WS endpoint against the publisher's base rather than its own.

### Bundled hosts (Next.js)

Dev servers with a module bundler (Next's Turbopack/webpack) statically analyse server imports. Plugin packages resolve their SPA dist with `new URL('../dist/...', import.meta.url)` and lazy-load node-side code — child processes, the native `zigpty` PTY backend — that resolves at runtime, not at bundle time. Load them with a dynamic `import()` carrying ignore comments so the bundler keeps them as a runtime Node import:

```ts
const pkgs = ['@devframes/plugin-git', '@devframes/plugin-terminals']
const defs = await Promise.all(
  pkgs.map(p => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ p)),
).then(mods => mods.map(m => m.default))

for (const def of defs)
  await mountDevframe(ctx, def)
```

Each mounted SPA is served at `/__<id>/` and references its assets relatively (`./_next/…`, `./assets/…`). Disable the bundler's trailing-slash redirect so those paths resolve under the mount base:

```js
// next.config.mjs
export default { skipTrailingSlashRedirect: true }
```

[`examples/minimal-next-devframe-hub/`](https://github.com/devframes/devframe/tree/main/examples/minimal-next-devframe-hub) is a working Next.js App Router host that mounts the built-in plugins this way.

### Duplicate devframes

When a devframe sharing an already-mounted `id` is mounted onto the same hub, its `duplicationStrategy` decides what happens. By default the first registration wins:

| Strategy | Behavior |
|---|---|
| `'warn'` (default) | Keep the first registration, drop the later one, and emit `DF8105`. |
| `'silent'` | Drop the later one without warning. |
| `'throw'` | Throw `DF8105`. |
| `'duplicate'` | Let every instance coexist under a disambiguated dock id (`my-tool`, `my-tool-2`, …). |

```ts
defineDevframe({
  id: 'my-tool',
  // …
  duplicationStrategy: 'duplicate',
})
```

## Grouping dock entries

When a hub combines many integrations, related dock entries can collapse under a single dock-bar button. A `type: 'group'` entry is that button; any entry pointing its `groupId` at the group's `id` becomes a member.

```ts
ctx.docks.register({
  type: 'group',
  id: 'nuxt',
  title: 'Nuxt',
  icon: 'logos:nuxt-icon',
  category: 'framework',
  defaultChildId: 'nuxt:overview', // optional; popover-only when omitted
})

ctx.docks.register({
  type: 'iframe',
  id: 'nuxt:overview',
  title: 'Overview',
  icon: 'ph:gauge-duotone',
  url: '/__nuxt-overview/',
  groupId: 'nuxt', // joins the group above
})
```

`groupId` lives on every entry kind, so iframes, launchers, json-render panels, and custom-render views all join groups the same way. The group and its members stay independent top-level entries in `devframe:docks`; a downstream UI derives the visual collapse by matching each member's `groupId` to the group's `id` and renders members in a popover or sub-navigation. `defaultChildId` names the member opened when the group button is activated.

Grouping is one level deep: members join a group, and a group is always a top-level button. A member whose group is never registered renders as a normal top-level entry, so registration order is free.

## The protocol — what the UI sees

A hub-aware UI doesn't import any hub classes; it reads three shared-state keys and one RPC method:

| Channel | Type | What it carries |
|---|---|---|
| `devframe:docks` shared state | `DevframeDockEntry[]` | Every dock entry the mounted integrations registered. |
| `devframe:commands` shared state | `DevframeServerCommandEntry[]` | Serializable command list (handlers stripped). |
| `devframe:user-settings` shared state | `DevframeDocksUserSettings` | Persisted per-workspace hub settings. |
| `devframe:docks:active` shared state | `DevframeDocksActiveState` | The most recent [dock activation](#cross-iframe-dock-activation) request, so a dock that mounts in response converges on it. |
| `hub:commands:execute` RPC | `(id, ...args) => unknown` | Server-side command dispatch. |
| `hub:docks:activate` RPC | `({ dockId, params? }) => void` | Switch the active dock from any client. |

Plus broadcast notifications (`devframe:docks:activate`, `devframe:terminals:updated`, `devframe:messages:updated`) that a UI can subscribe to via `rpc.client.register(...)`. The client host registers the `devframe:docks:activate` handler for you.

## Running plugin code in the host page

The hub also ships a headless browser runtime, `createDevframeClientHost()` from `@devframes/hub/client`. Booted in the host page, it assembles the shared client context from the protocol above and imports each dock entry's client script into that page — how a plugin like the a11y inspector runs code inside the page being inspected. See [Client Scripts & Client Context](./client-context) for the boot flow, the context surface, and the dock-script contract.

## Example

Two minimal, copyable hubs mount every built-in plugin (git, terminals, code-server, inspect, a11y) behind an icon dock — the same shape [vite-devtools](https://github.com/vitejs/devtools) wears as the full Vite viewer, shrunk to the smallest thing you can build your own viewer from:

- [`examples/minimal-vite-devframe-hub/`](https://github.com/devframes/devframe/tree/main/examples/minimal-vite-devframe-hub) — a ~120-line Vite plugin host with a vanilla DOM UI.
- [`examples/minimal-next-devframe-hub/`](https://github.com/devframes/devframe/tree/main/examples/minimal-next-devframe-hub) — the same protocol hosted from a Next.js App Router app.

Every framework's hub host follows the same shape: a thin `DevframeHost` adapter over the framework's dev server, with the dock/commands/messages/terminals protocol unchanged above it.

## Diagnostics

Hub-side diagnostic codes live in the `DF8xxx` range. See the [error reference](/errors/) for the full list.
