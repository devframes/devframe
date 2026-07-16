/**
 * Devframe connection state + the data BACKEND the workbench talks through.
 *
 * The backend is chosen once at boot (`connect()`):
 *   - **rpc** — a live devframe server; every method is a namespaced RPC call.
 *   - **static** — a pre-exported dataset (`./data-inspector-static.json`,
 *     advertised by a `backend: 'static'` `./__connection.json`); queries,
 *     suggestions and skeletons run entirely client-side via the isomorphic
 *     engine, and saved-query persistence is unavailable.
 */
// The type-only package-root import pulls `devframe` into this TS program so
// the package's `declare module 'devframe'` augmentations (src/registry)
// resolve until the plugin's node entries land and import it for real.
// Erased at build time.
import type {} from 'devframe'
import type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'
import type {
  DataSourceMeta,
  FilterOptions,
  QueryOutcome,
  SavedQuery,
  SavedQueryScope,
  SaveQueryInput,
  SkeletonOutcome,
  SuggestOutcome,
} from '../../engine'
import { connectDevframe } from 'devframe/client'
import { reactive, shallowRef } from 'vue'
import { runQuery, skeletonOf, suggest as suggestQuery } from '../../engine'

export const connection = reactive<{
  connected: boolean
  status: DevframeConnectionStatus
  error: string | null
  /** Which backend serves the workbench; decided at boot. */
  mode: 'rpc' | 'static'
}>({
  connected: false,
  status: 'connecting',
  error: null,
  mode: 'rpc',
})

/** Everything the workbench needs from a data backend, transport-agnostic. */
export interface DataBackend {
  /** True when running against a pre-exported dataset (no live server). */
  readonly static: boolean
  sources: () => Promise<DataSourceMeta[]>
  query: (sourceId: string, query: string, options: FilterOptions) => Promise<QueryOutcome>
  suggest: (sourceId: string, query: string, pos: number) => Promise<SuggestOutcome>
  skeleton: (sourceId: string, options: FilterOptions) => Promise<SkeletonOutcome>
  savedList: () => Promise<SavedQuery[]>
  savedSave: (input: SaveQueryInput) => Promise<SavedQuery>
  savedDelete: (id: string, scope: SavedQueryScope) => Promise<void>
  /** Fires when the server's source registry changes (rpc mode only). */
  onSourcesChanged: (listener: () => void) => void
}

const backendRef = shallowRef<DataBackend | null>(null)

/** The active backend — `connect()` must have completed. */
export function backend(): DataBackend {
  if (!backendRef.value)
    throw new Error('not connected')
  return backendRef.value
}

// ── rpc backend ──────────────────────────────────────────────────────

function createRpcBackend(client: DevframeRpcClient): DataBackend {
  /** Untyped call escape hatch — the functions aren't module-augmented here. */
  const call = <T>(name: string, ...args: unknown[]): Promise<T> =>
    (client.call as unknown as (name: string, ...args: unknown[]) => Promise<T>)(name, ...args)

  return {
    static: false,
    sources: () => call<DataSourceMeta[]>('devframes:plugin:data-inspector:sources'),
    query: (sourceId, query, options) =>
      call<QueryOutcome>('devframes:plugin:data-inspector:query', sourceId, query, options),
    suggest: (sourceId, query, pos) =>
      call<SuggestOutcome>('devframes:plugin:data-inspector:suggest', sourceId, query, pos),
    skeleton: (sourceId, options) =>
      call<SkeletonOutcome>('devframes:plugin:data-inspector:skeleton', sourceId, options),
    savedList: () => call<SavedQuery[]>('devframes:plugin:data-inspector:saved:list'),
    savedSave: input => call<SavedQuery>('devframes:plugin:data-inspector:saved:save', input),
    savedDelete: async (id, scope) => {
      await call('devframes:plugin:data-inspector:saved:delete', id, scope)
    },
    onSourcesChanged: (listener) => {
      // The node side broadcasts this client event on register/unregister.
      client.client.register({
        name: 'devframes:plugin:data-inspector:sources:changed' as never,
        type: 'event',
        handler: listener,
      } as never)
    },
  }
}

// ── static backend ───────────────────────────────────────────────────

/** One exported source: its meta plus the pre-normalized dataset. */
interface StaticSourceEntry extends DataSourceMeta {
  data: unknown
}

interface StaticDataset {
  sources: StaticSourceEntry[]
}

function createStaticBackend(dataset: StaticDataset): DataBackend {
  const entries = dataset.sources

  function dataOf(sourceId: string): unknown {
    const source = entries.find(s => s.id === sourceId)
    if (!source)
      throw new Error(`unknown data source "${sourceId}"`)
    return source.data
  }

  return {
    static: true,
    async sources() {
      return entries.map(({ data: _data, ...meta }) => meta)
    },
    async query(sourceId, query, options) {
      return runQuery(dataOf(sourceId), query, options)
    },
    async suggest(sourceId, query, pos) {
      return suggestQuery(dataOf(sourceId), query, pos)
    },
    async skeleton(sourceId, options) {
      try {
        return { ok: true, ...skeletonOf(dataOf(sourceId), options) }
      }
      catch (error) {
        const e = error instanceof Error ? error : new Error(String(error))
        return { ok: false, error: { name: e.name, message: e.message } }
      }
    },
    async savedList() {
      return []
    },
    async savedSave() {
      throw new Error('saved queries are unavailable in static mode')
    },
    async savedDelete() {
      throw new Error('saved queries are unavailable in static mode')
    },
    onSourcesChanged: () => {}, // a static dataset never changes
  }
}

// ── boot ─────────────────────────────────────────────────────────────

/**
 * Read and strip the pre-shared auth token the attach CLI appends to the SPA
 * URL (`?di_token=…`), so it never lingers in the address bar or history.
 */
function consumeAuthToken(): string | undefined {
  const params = new URLSearchParams(location.search)
  const token = params.get('di_token')
  if (!token)
    return undefined
  params.delete('di_token')
  const search = params.toString()
  history.replaceState(null, '', search ? `?${search}` : location.pathname)
  return token
}

/**
 * A `backend: 'static'` connection meta means there is no server to talk to:
 * load the exported dataset instead. Any probe failure (no meta, non-static
 * backend) falls through to the live RPC connection.
 */
async function probeStaticDataset(): Promise<StaticDataset | null> {
  try {
    const res = await fetch('./__connection.json')
    if (!res.ok)
      return null
    const meta = await res.json() as { backend?: string } | null
    if (meta?.backend !== 'static')
      return null
  }
  catch {
    return null
  }
  const res = await fetch('./data-inspector-static.json')
  if (!res.ok)
    throw new Error(`failed to load static dataset (${res.status})`)
  return await res.json() as StaticDataset
}

function applyStatus(client: DevframeRpcClient): void {
  connection.status = client.status
  connection.connected = client.status === 'connected'
  connection.error = client.connectionError?.message ?? null
}

export async function connect(): Promise<void> {
  const authToken = consumeAuthToken()
  try {
    const dataset = await probeStaticDataset()
    if (dataset) {
      backendRef.value = createStaticBackend(dataset)
      connection.mode = 'static'
      // A static export has no live socket; it is "connected" for its whole life.
      connection.status = 'connected'
      connection.connected = true
      connection.error = null
      return
    }
    const client = await connectDevframe({ baseURL: './', authToken })
    backendRef.value = createRpcBackend(client)
    applyStatus(client)
    client.events.on('connection:status', () => applyStatus(client))
    await client.ensureTrusted(10_000).catch(() => {})
    applyStatus(client)
  }
  catch (error) {
    connection.status = 'error'
    connection.error = error instanceof Error ? error.message : String(error)
  }
}
