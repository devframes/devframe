# @devframes/plugin-data-inspector

Inspect live server-side objects interactively. Other plugins and hosts register **data sources**; the workbench composes [jora](https://github.com/discoveryjs/jora) queries against them — executed in the process that owns the objects — and renders normalized results in a [discovery.js](https://github.com/discoveryjs/discovery) struct view with type badges, a shape panel, saved queries, and shareable URL state. Deep graphs expand a level at a time (`load deeper` fetches each subtree on demand), an optional poller re-runs the query every N seconds, and a toolbar offers expand/collapse-all and copy.

## Register a data source

The registry is **process-global** — register from anywhere, before or after the plugin mounts:

```ts
import { registerDataSource } from '@devframes/plugin-data-inspector/registry'

registerDataSource({
  id: 'my-plugin:state',
  title: 'My plugin state',
  description: 'The live state store',
  data: () => store, // value or (async) factory; `static: true` memoizes
  queries: [{ title: 'Active entries', query: 'entries.mapEntries()' }],
})
```

Integrations that prefer zero package dependency consume the same store through the typed context service:

```ts
ctx.services.whenAvailable('devframes:plugin:data-inspector:sources', (sources) => {
  sources.register({ id: 'my-plugin:state', title: 'My state', data: () => store })
})
```

## Mount

```ts
// hub hosts mount the default export like any devframe:
import dataInspectorDevframe from '@devframes/plugin-data-inspector'
// Vite
import { dataInspectorVitePlugin } from '@devframes/plugin-data-inspector/vite'
```

## Standalone CLI

```sh
devframe-data-inspector stats.json trace.jsonl   # inspect local data files
devframe-data-inspector build stats.json         # self-contained static export
devframe-data-inspector attach                   # attach to a process running the agent
```

Static exports embed the dataset and run the same query engine client-side, so saved recipes stay portable.

## Attach to another Node process

```ts
import { exposeDataInspector } from '@devframes/plugin-data-inspector/inject'

// pass sources inline, or register them separately beforehand
await exposeDataInspector({
  sources: [{ id: 'app:store', title: 'App store', data: () => store }],
})
```

or with zero code changes:

```sh
DEVFRAME_DATA_INSPECTOR=1 node --import @devframes/plugin-data-inspector/inject server.js
```

On the zero-code path there's nowhere to call `registerDataSource`, so the agent auto-registers a **`globalThis`** source: assign what you want to inspect onto the global object (`globalThis.store = store`) and query it live. Opt out with `DEVFRAME_DATA_INSPECTOR_GLOBAL=0`.

The agent binds `127.0.0.1`, requires devframe's trust handshake with a per-run token by default, and advertises its endpoint in `node_modules/.data-inspector/agent.json`, which `devframe-data-inspector attach` picks up automatically.

> [!WARNING]
> A connected inspector runs eval-grade jora queries against live objects: queries can invoke functions reachable as own properties and fire getters. Treat the agent endpoint like a debugger port — keep it on loopback and keep auth on.

## Saved queries

Recipes (`{ query, title?, description?, ...filters }`) persist id-keyed in two scopes: **workspace** (committable, `getStorageDir('workspace')/data-inspector/queries.json` — shared with the team) and **project** (per-checkout, under `node_modules`).
