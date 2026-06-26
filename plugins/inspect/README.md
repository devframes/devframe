# @devframes/plugin-inspect

> [!WARNING] Experimental
> This plugin is experimental and may change without a major version bump until
> it stabilizes.

A devframe plugin that inspects *its own* connection (and, when mounted in a
host, the host's): browse every registered RPC function with its metadata,
invoke read-only `query`/`static` functions and inspect the results, watch
shared-state keys update live, and explore the agent-exposed surface.

Ported in spirit from the RPC & State panels of
[`vitejs/devtools`](https://github.com/vitejs/devtools); rebuilt on devframe's
framework-neutral client (`connectDevframe`, `rpc.sharedState`) with a Vue + Vite SPA.

## Use it standalone

```bash
npx @devframes/plugin-inspect
```

Opens the inspector against a fresh standalone devframe connection — useful as a
reference and for poking at the introspection RPCs themselves.

## Mount into a Vite host

```ts
// vite.config.ts
import { inspectVitePlugin } from '@devframes/plugin-inspect/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    inspectVitePlugin(),
  ],
})
```

## Programmatic

```ts
import { createInspectDevframe } from '@devframes/plugin-inspect'

const devframe = createInspectDevframe({ port: 9100 })
```

## RPC surface

All functions are namespaced `devframes-plugin-inspect:*`:

| Function | Type | What it returns |
|----------|------|-----------------|
| `list-functions` | `query` (snapshot) | Every registered RPC function with metadata (type, JSON-serializable/snapshot flags, args/return JSON Schema, agent exposure). |
| `invoke` | `action` | Invokes a read-only `query`/`static` function by name and returns a result envelope. Refuses `action`/`event` functions. |
| `list-state-keys` | `query` (snapshot) | The keys of every shared-state entry on the connection. |
| `describe-agent` | `query` (snapshot) | The agent manifest — tools and readable resources. |

The three `query` functions are agent-exposed (read-only) and bake into the
static dump, so the inspector still lists functions, state keys, and the agent
surface when deployed as a static SPA.
