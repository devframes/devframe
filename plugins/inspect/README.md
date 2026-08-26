# @devframes/plugin-inspect

> [!WARNING] Experimental
> This devframe is experimental and may change without a major version bump until
> it stabilizes.

A built-in devframe that inspects *its own* connection (and, when mounted in a
hub, the hub's): browse every registered RPC function with its metadata,
invoke read-only `query`/`static` functions and inspect the results, watch
shared-state keys update live, explore the agent-exposed API, and — while
running against a live backend — list the other devframe dev servers running
alongside it.

Ported in spirit from the RPC & State panels of
[`vitejs/devtools`](https://github.com/vitejs/devtools); rebuilt on devframe's
framework-neutral client (`connectDevframe`, `rpc.sharedState`) with a Vue + Vite SPA.

## Use it standalone

```bash
pnpx @devframes/plugin-inspect
```

Opens the inspector against a fresh standalone devframe connection — useful as a
reference and for poking at the introspection RPCs themselves.

## Mount into a Vite host

```ts
// vite.config.ts
import createInspectDevframe from '@devframes/plugin-inspect'
import { devframeVite } from '@devframes/vite/single'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    devframeVite(createInspectDevframe()),
  ],
})
```

## Programmatic

```ts
import { createInspectDevframe } from '@devframes/plugin-inspect'

const devframe = createInspectDevframe({ port: 9100 })
```

## RPC

All functions are namespaced `devframes:plugin:inspect:*`:

| Function | Type | What it returns |
|----------|------|-----------------|
| `list-functions` | `query` (snapshot) | Every registered RPC function with metadata (type, JSON-serializable/snapshot flags, args/return JSON Schema, agent exposure). |
| `invoke` | `action` | Invokes a read-only `query`/`static` function by name and returns a result envelope. Refuses `action`/`event` functions. |
| `list-state-keys` | `query` (snapshot) | The keys of every shared-state entry on the connection. |
| `describe-agent` | `query` (snapshot) | The agent manifest — tools and readable resources. |
| `list-instances` | `query` (live) | Every devframe dev server currently running on the machine, discovered through the shared instance registry. Powers the read-only Instances tab. |

The three snapshot `query` functions are agent-exposed (read-only) and bake into
the static dump, so the inspector still lists functions, state keys, and the
agent-exposed API when deployed as a static SPA. `list-instances` is live rather
than baked (the set of running processes is meaningless in a static dump), so
the Instances tab appears only against a live backend.
