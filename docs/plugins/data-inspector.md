---
outline: deep
---

# Data Inspector

A **Vue** query workbench for live server-side objects: register **data sources**, then compose [jora](https://discoveryjs.github.io/jora/) queries that run in the owning process.

Package: `@devframes/plugin-data-inspector` · framework: **Vue + Vite**

<figure class="screenshot">
<img src="/screenshots/plugin-data-inspector-1.png" alt="Data Inspector screenshot" />
<figcaption>Query workbench with results and data shape panel</figcaption>
</figure>

<figure class="screenshot">
  <img src="/screenshots/plugin-data-inspector-2.png" alt="Data Inspector screenshot" />
  <figcaption>Query data with advanced Jora syntax</figcaption>
</figure>

## What it does

- **Query workbench** — a CodeMirror jora editor with server-computed autocomplete; queries auto-run as you type. State persists in the URL hash ([Deep linking](#deep-linking)).
- **Auto rerun** — an optional poller (`auto rerun every N seconds`); ticks skip while a run is in flight or broken.
- **Result viewer** — results normalize to strict JSON (circulars → `$ref`; Maps, Sets, class instances, functions, Dates get type badges) with per-query stats.
- **Expansion, shape & filters** — a node past the depth cap fetches lazily via `load deeper`; a data-shape panel shows a one-level skeleton; filters exclude functions and `_`/`$`-prefixed properties.
- **Saved queries** — recipes (`query` + title/description + authoring filters) in **workspace** (committable) and **project** (per-checkout) scopes.

A built-in **example source** registers by default; opt out with `createDataInspectorDevframe({ exampleSource: false })` (CLI `--no-example`, agent `DEVFRAME_DATA_INSPECTOR_EXAMPLE=0`).

## Providing data sources

The registry is **process-global** — register from anywhere, before or after mount.

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

Live objects stay live; `registerDataSource` returns an unregister callback.

Zero-dependency integrations use the typed [context service](../guide/devframe-definition#cross-plugin-services):

```ts
ctx.services.whenAvailable('devframes:plugin:data-inspector:sources', (sources) => {
  sources.register({ id: 'my-plugin:store', title: 'My store', data: () => store })
})
```

> [!WARNING]
> Queries are eval-grade: jora invokes any function reachable as an own property and fires own getters. Register live objects accordingly, and keep endpoints on loopback.

## Deep linking

Workbench state lives in the URL hash (`#source=<id>&query=<jora>`, filters). The handshake token rides the query string (`?devframe_auth_token=`), scrubbed on read so it stays out of shared links.

In a hub, another dock can jump to a source via [dock activation](../guide/deep-linking#focusing-a-dock-inside-a-hub): target `devframes:plugin:data-inspector` with a `sourceId` (waiting for it to register).

```ts
await rpc.call('hub:docks:activate', {
  dockId: 'devframes:plugin:data-inspector',
  params: { sourceId: 'my-plugin:store' },
})
```

## Standalone

```sh
pnpx @devframes/plugin-data-inspector                      # the example source
pnpx @devframes/plugin-data-inspector stats.json log.jsonl # one static source per data file
pnpx @devframes/plugin-data-inspector build stats.json     # self-contained static export
pnpx @devframes/plugin-data-inspector attach               # attach to a process running the agent
```

`.json` parses whole; `.jsonl` / `.ndjson` as an array of records. `build` embeds the dataset in a static site.

## Mount into a Vite host

In [Vite DevTools](https://devtools.vite.dev):

```ts
// vite.config.ts
import createDataInspectorDevframe from '@devframes/plugin-data-inspector'
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    createPluginFromDevframe(createDataInspectorDevframe()),
  ],
})
```

Register sources with `registerDataSource`; or use `devframeVite` from `@devframes/vite/single`:

```ts
import { devframeVite } from '@devframes/vite/single'

devframeVite(createDataInspectorDevframe())
```

## Programmatic

`createDataInspectorDevframe(options)` returns a definition for any adapter:

```ts
import { createDataInspectorDevframe } from '@devframes/plugin-data-inspector'

export default createDataInspectorDevframe({
  exampleSource: false,
})
```

## Attach to another Node process

The target starts the agent:

```ts
import { exposeDataInspector } from '@devframes/plugin-data-inspector/inject'

await exposeDataInspector({
  sources: [{ id: 'app:store', title: 'App store', data: () => store }],
})
```

`sources` pre-registers entries; call it empty to expose whatever's registered.

Or with no code changes:

```sh
DEVFRAME_DATA_INSPECTOR=1 node --import @devframes/plugin-data-inspector/inject server.js
```

The zero-code path auto-registers a **`globalThis`** source — assign anything onto it and query live:

```ts
// somewhere in the running process
globalThis.store = store
globalThis.cache = cache
```

It reads `globalThis` at query time, so later assignments show up next run. Opt out: `DEVFRAME_DATA_INSPECTOR_GLOBAL=0`.

The agent binds `127.0.0.1`, requires the trust handshake with a per-run token, and writes its endpoint to `node_modules/.data-inspector/agent.json`; `attach` reads it (or pass `ws://…` and `--token`). Treat it as a debugger port.

## RPC surface

Namespaced `devframes:plugin:data-inspector:*`:

| Function | Type | Returns |
|----------|------|---------|
| `sources` | `query` | Every registered source (meta, suggested queries). |
| `query` | `query` | Runs a jora query; normalized result with stats. |
| `queryPath` | `query` | Depth-limited subtree slice (lazy expansion). |
| `skeleton` | `query` | A source's type skeleton, honoring filters. |
| `suggest` | `query` | Autocomplete candidates at a cursor. |
| `saved:list` / `saved:save` / `saved:delete` | `query` / `action` | Saved-query recipes (`workspace`, `project` scopes). |

## Source

[`plugins/data-inspector`](https://github.com/devframes/devframe/tree/main/plugins/data-inspector)
