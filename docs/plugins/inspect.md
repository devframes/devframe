---
outline: deep
---

# Devframe Inspector

A self-inspector for any devframe connection, built as a **Vue** SPA. It browses the RPC registry, invokes read-only functions and shows their results, watches shared-state keys update live, and explores the agent-exposed surface — including the host's, when mounted into one.

Package: `@devframes/plugin-inspect` · framework: **Vue + Vite**

## What it does

- **Functions** — every registered RPC function with its type, JSON-serializable / snapshot flags, args and return JSON Schema, and agent exposure. Read-only `query` / `static` functions can be invoked inline and their result envelope inspected.
- **State** — the keys of every shared-state entry, with a live JSON tree that flashes the paths that change as patches arrive.
- **Agent** — the agent manifest: the tools and readable resources the devframe exposes to coding agents.
- **History** — a recordable timeline of RPC calls and shared-state updates observed over the connection.

The three introspection `query` functions are agent-exposed and bake into the static dump, so the inspector still lists functions, state keys, and the agent surface when deployed as a static SPA.

## Standalone

```sh
npx @devframes/plugin-inspect
```

Opens the inspector against a fresh standalone devframe connection — handy as a reference and for poking at the introspection RPCs themselves. The CLI prints the URL it serves on.

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

`createInspectDevframe(options)` returns a definition you can deploy through any adapter:

```ts
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createCli } from 'devframe/adapters/cli'

await createCli(createInspectDevframe({ port: 9100 })).parse()
```

## RPC surface

All functions are namespaced `devframes-plugin-inspect:*`:

| Function | Type | Returns |
|----------|------|---------|
| `list-functions` | `query` (snapshot) | Every registered RPC function with metadata. |
| `invoke` | `action` | Invokes a read-only `query` / `static` function and returns a result envelope; refuses `action` / `event` functions. |
| `list-state-keys` | `query` (snapshot) | The keys of every shared-state entry. |
| `describe-agent` | `query` (snapshot) | The agent manifest — tools and readable resources. |

## Source

[`plugins/inspect`](https://github.com/devframes/devframe/tree/main/plugins/inspect)
