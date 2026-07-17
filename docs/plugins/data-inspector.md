---
outline: deep
---

# Data Inspector

An interactive query workbench for live server-side objects, built as a **Vue** SPA. Plugins and hosts register **data sources**; you compose [jora](https://discoveryjs.github.io/jora/) queries against them — executed in the process that owns the objects — and explore normalized results in a struct view with type badges, a data-shape panel, filters, and saved queries.

Package: `@devframes/plugin-data-inspector` · framework: **Vue + Vite**

## What it does

- **Query workbench** — a CodeMirror jora editor with syntax highlighting and server-computed autocomplete; queries auto-run as you type, with a client-side syntax gate so malformed input never hits the wire. Source, query, and filters persist in the URL, so any workbench state is shareable.
- **Result viewer** — results normalize to strict JSON (circulars become `$ref` markers; Maps, Sets, class instances, functions, and Dates get type badges) with per-query stats: jora / normalize / rpc timings, payload size, node count. The value-actions popup copies paths and turns any key into a query.
- **Data shape panel** — a one-level type skeleton of the active source, independent of the query; click a property to query it.
- **Filters** — exclude functions, `_`-prefixed, or `$`-prefixed properties from results and skeleton alike.
- **Saved queries** — recipes (`query` + optional title/description + the filters they were authored with), id-keyed, in two scopes: **workspace** (committable, shared with the team) and **project** (per-checkout).

A built-in **example source** is always registered alongside your own: it exposes the devframe context (registered RPC functions, services, storage dirs), OS info, and live process stats — with query-time getters that change on every re-run — plus a small playground branch exercising every viewer capability. Opt out with `createDataInspectorDevframe({ exampleSource: false })` (CLI: `--no-example`, agent: `DEVFRAME_DATA_INSPECTOR_EXAMPLE=0`).

## Providing data sources

The registry is **process-global**: register from anywhere in the process — plugin setup, host hooks, application code — before or after the inspector mounts.

```ts
import { registerDataSource } from '@devframes/plugin-data-inspector/registry'

registerDataSource({
  id: 'my-plugin:store', // namespace with your plugin id
  title: 'My plugin store',
  description: 'The live state store',
  icon: 'i-ph:database-duotone',
  data: () => store,
  queries: [
    { title: 'Active sessions', query: 'sessions.mapEntries().value.[active]' },
    { title: 'Config (data only)', query: 'config', excludeFunctions: true },
  ],
})
```

The contract:

```ts
interface DataSourceEntry {
  id: string
  title: string
  description?: string
  icon?: string
  /** A plain value, or a factory returning one (sync or async). */
  data: unknown | (() => unknown | Promise<unknown>)
  /** The resolved value never changes: resolve once and memoize. */
  static?: boolean
  /** Suggested queries, shown read-only next to saved ones. */
  queries?: Query[]
}
```

Live objects passed to `data` stay live — every query reads their current state. `registerDataSource` returns an unregister function, and connected workbenches refresh their source list on every change.

Integrations that prefer zero package dependency consume the same registry through the typed [context service](../guide/devframe-definition#cross-plugin-services):

```ts
ctx.services.whenAvailable('devframes:plugin:data-inspector:sources', (sources) => {
  sources.register({ id: 'my-plugin:store', title: 'My store', data: () => store })
})
```

> [!WARNING]
> Queries are eval-grade access to registered objects: jora can invoke any function reachable as an own property and fires own getters. Register live objects with that in mind, and keep inspector endpoints on loopback.

## Mount into a Vite host

```ts
import { registerDataSource } from '@devframes/plugin-data-inspector/registry'
// vite.config.ts
import { dataInspectorVitePlugin } from '@devframes/plugin-data-inspector/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    dataInspectorVitePlugin(),
    {
      name: 'my-app:data-sources',
      configureServer(server) {
        registerDataSource({
          id: 'vite:server',
          title: 'Vite Dev Server',
          data: () => server,
          queries: [{ title: 'Plugin names', query: 'config.plugins.name' }],
        })
      },
    },
  ],
})
```

Hub hosts mount the default export like any devframe definition.

## Standalone CLI

```sh
devframe-data-inspector                      # the example source
devframe-data-inspector stats.json log.jsonl # one static source per data file
devframe-data-inspector build stats.json     # self-contained static export
devframe-data-inspector attach               # attach to a process running the agent
```

`.json` files parse whole; `.jsonl` / `.ndjson` parse as an array of records. `build` writes a static site embedding the dataset — the same query engine runs client-side there, so saved recipes keep working.

## Attach to another Node process

The target process opts in by starting the agent:

```ts
import { exposeDataInspector } from '@devframes/plugin-data-inspector/agent'

await exposeDataInspector()
```

or with zero code changes:

```sh
DEVFRAME_DATA_INSPECTOR=1 node --import @devframes/plugin-data-inspector/agent server.js
```

The agent binds `127.0.0.1`, requires devframe's trust handshake with a per-run pre-shared token, and advertises its endpoint in `node_modules/.data-inspector/agent.json` — `devframe-data-inspector attach` consumes it automatically (or pass `ws://…` and `--token` explicitly). Queries execute inside the target process, where the live objects are. Treat the endpoint like a debugger port.

## RPC surface

All functions are namespaced `devframes:plugin:data-inspector:*`:

| Function | Type | Returns |
|----------|------|---------|
| `sources` | `query` | Every registered source (meta and suggested queries). |
| `query` | `query` | Runs a jora query against a source; normalized result with stats. |
| `skeleton` | `query` | The type skeleton of a source, honoring the filter options. |
| `suggest` | `query` | Autocomplete candidates from jora's stat mode at a cursor position. |
| `saved:list` / `saved:save` / `saved:delete` | `query` / `action` | Saved-query recipes in the `workspace` and `project` scopes. |
