---
outline: deep
---

# Hub (multi-tool)

`@devframes/hub` extends devframe with the orchestration features that only make sense when many devtools share a UI: a dock registry, terminal aggregation, message/toast queue, and a command palette. It does not ship UI — each framework kit (e.g. `@vitejs/devtools-kit`) provides its own UI on top of the hub's RPC + shared-state protocol.

> [!WARNING] Experimental
> The hub API surface is still being refined. Names may change before 1.0.

## What the hub adds

A hub-aware node context (`HubNodeContext`) extends `DevframeNodeContext` with four subsystems:

| Subsystem | Surface | Purpose |
|---|---|---|
| `ctx.docks` | `register / update / values` | Multi-tool dock entries (iframes, launchers, json-render, custom-render). |
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
