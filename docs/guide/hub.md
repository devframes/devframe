---
outline: deep
---

# Hub (multi-tool)

`@devframes/hub` extends devframe with the orchestration features that only make sense when many devtools share a UI: a dock registry, terminal aggregation, message/toast queue, and a command palette. It does not ship UI — each framework kit (e.g. `@vitejs/devtools-kit`) provides its own UI on top of the hub's RPC + shared-state protocol.

> [!WARNING] Experimental
> The hub API surface is still being refined. Names may change before 1.0.

## What the hub adds

A hub-aware node context (`DevframeHubContext`) extends `DevframeNodeContext` with four subsystems:

| Subsystem | Surface | Purpose |
|---|---|---|
| `ctx.docks` | `register / update / values` | Multi-tool dock entries (iframes, launchers, json-render, custom-render) and groups that collapse them under one button. |
| `ctx.terminals` | `register / startChildProcess` | Aggregate terminal sessions, stream output over a well-known channel. |
| `ctx.messages` | `add / update / remove / clear` | Server-side toast/notification queue (FIFO, capped at 1000). |
| `ctx.commands` | `register / execute / list` | Hierarchical command palette with keybindings and `when` clauses. |

Plus a `createJsonRenderer(spec)` factory for building remote-UI panels via the framework-neutral json-render DSL.

## Built-in RPC

Every hub context auto-registers this RPC function so framework kits don't reimplement it:

- `hub:commands:execute` — invoke a registered server command by id. `await rpc.call('hub:commands:execute', 'my-tool:do-thing', ...args)`.

Host-specific capabilities (open in editor, reveal in finder, …) ship as kit-registered RPC functions rather than as part of the hub surface.

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

Hosts that omit `mountConnectionMeta` fall back to same-origin window inheritance, which connects an embedded SPA only when it shares an origin with the hub UI.

### Bundled hosts (Next.js)

Dev servers with a module bundler (Next's Turbopack/webpack) statically analyse server imports. Plugin packages resolve their SPA dist with `new URL('../dist/...', import.meta.url)` and lazy-load node-side code — child processes, the native `node-pty` PTY backend — that resolves at runtime, not at bundle time. Load them with a dynamic `import()` carrying ignore comments so the bundler keeps them as a runtime Node import:

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
| `devframe:docks` shared state | `DevframeDockEntry[]` | The full dock list, including the hub's `~terminals` / `~messages` / `~settings` builtins. |
| `devframe:commands` shared state | `DevframeServerCommandEntry[]` | Serializable command list (handlers stripped). |
| `devframe:user-settings` shared state | `DevframeDocksUserSettings` | Persisted per-workspace hub settings. |
| `hub:commands:execute` RPC | `(id, ...args) => unknown` | Server-side command dispatch. |

Plus broadcast notifications (`devframe:terminals:updated`, `devframe:messages:updated`) that a UI can subscribe to via `rpc.client.register(...)`.

## Example

See [`examples/minimal-vite-devframe-hub/`](https://github.com/devframes/devframe/tree/main/examples/minimal-vite-devframe-hub) for a ~120-line Vite plugin that wires the hub end to end with a vanilla DOM UI. Every framework's hub host follows the same shape: a thin layer that adapts the framework's dev server to the hub.

## Diagnostics

Hub-side diagnostic codes live in the `DF8xxx` range. See the [error reference](/errors/) for the full list.
