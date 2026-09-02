/**
 * Devframe connection state + the data BACKEND the workbench talks through.
 *
 * The backend is chosen once at boot (`connect()`):
 *   - **rpc** - a live devframe server; every method is a namespaced RPC call.
 *   - **static** - a pre-exported dataset (`./data-inspector-static.json`,
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
  NodePath,
  QueryOutcome,
  SavedQuery,
  SavedQueryScope,
  SaveQueryInput,
  SkeletonOutcome,
  SuggestOutcome,
  WriteOutcome,
  WriteRequest,
} from '../../engine'
import { connectDevframe } from 'devframe/client'
import { DEVFRAME_AUTH_TOKEN_QUERY_PARAM } from 'devframe/constants'
import { reactive, shallowRef } from 'vue'
import { runQuery, runQueryAtPath, skeletonOf, suggest as suggestQuery } from '../../engine'

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
  /** Lazily expand a depth-truncated node: a fresh slice of the subtree at `path`. */
  queryPath: (sourceId: string, query: string, path: NodePath, options: FilterOptions) => Promise<QueryOutcome>
  suggest: (sourceId: string, query: string, pos: number) => Promise<SuggestOutcome>
  skeleton: (sourceId: string, options: FilterOptions) => Promise<SkeletonOutcome>
  savedList: () => Promise<SavedQuery[]>
  savedSave: (input: SaveQueryInput) => Promise<SavedQuery>
  savedDelete: (id: string, scope: SavedQueryScope) => Promise<void>
  /** Mutate a writable source's live object (rpc mode only). */
  write: (sourceId: string, request: WriteRequest, options: FilterOptions) => Promise<WriteOutcome>
  /** Fires when the server's source registry changes (rpc mode only). */
  onSourcesChanged: (listener: () => void) => void
  /** Fires when a source's data changes (writes, server-side notifications). */
  onDataChanged: (listener: (sourceId: string) => void) => void
}

const backendRef = shallowRef<DataBackend | null>(null)

/** The active backend - `connect()` must have completed. */
export function backend(): DataBackend {
  if (!backendRef.value)
    throw new Error('not connected')
  return backendRef.value
}

// ── dock activation (deep-link focus, hub only) ──────────────────────

/** The hub mirrors the latest dock-activation intent into this shared-state slot. */
const DOCKS_ACTIVE_STATE_KEY = 'devframe:docks:active'

/** The live client, kept for the shared-state subscription below (rpc mode). */
let rpcClient: DevframeRpcClient | null = null

/**
 * Subscribe to the hub's dock-activation slot. When an activation targets this
 * dock (`dockId`) and carries a `sourceId`, invoke `apply` with it - the
 * deep-link path that lets another dock (e.g. a messages feed) jump the user
 * straight to a data source. Reads the slot once on subscribe (so a dock that
 * mounts *because* of the activation still converges) and on every update.
 * Inert outside a hub - static mode or no shared state simply never fires.
 */
export async function onDockActivation(dockId: string, apply: (sourceId: string) => void): Promise<void> {
  const client = rpcClient
  if (!client)
    return
  interface Activation { dockId?: string, params?: Record<string, unknown> }
  const handle = (v: { activation?: Activation | null } | undefined): void => {
    const activation = v?.activation
    if (!activation || activation.dockId !== dockId)
      return
    const sourceId = activation.params?.sourceId
    if (typeof sourceId === 'string')
      apply(sourceId)
  }
  try {
    const slot = await client.sharedState.get(DOCKS_ACTIVE_STATE_KEY, { initialValue: { activation: null } }) as {
      value: () => { activation?: Activation | null }
      on: (event: string, cb: (v: { activation?: Activation | null }) => void) => void
    }
    handle(slot.value())
    slot.on('updated', handle)
  }
  catch {
    // No hub / no shared state - deep-linking simply stays inert.
  }
}

// ── rpc backend ──────────────────────────────────────────────────────

function createRpcBackend(client: DevframeRpcClient): DataBackend {
  /** Untyped call escape hatch - the functions aren't module-augmented here. */
  const call = <T>(name: string, ...args: unknown[]): Promise<T> =>
    (client.call as (name: string, ...args: unknown[]) => Promise<T>)(name, ...args)

  return {
    static: false,
    sources: () => call<DataSourceMeta[]>('devframes:plugin:data-inspector:sources'),
    query: (sourceId, query, options) =>
      call<QueryOutcome>('devframes:plugin:data-inspector:query', sourceId, query, options),
    queryPath: (sourceId, query, path, options) =>
      call<QueryOutcome>('devframes:plugin:data-inspector:queryPath', sourceId, query, path, options),
    suggest: (sourceId, query, pos) =>
      call<SuggestOutcome>('devframes:plugin:data-inspector:suggest', sourceId, query, pos),
    skeleton: (sourceId, options) =>
      call<SkeletonOutcome>('devframes:plugin:data-inspector:skeleton', sourceId, options),
    savedList: () => call<SavedQuery[]>('devframes:plugin:data-inspector:saved:list'),
    savedSave: input => call<SavedQuery>('devframes:plugin:data-inspector:saved:save', input),
    savedDelete: async (id, scope) => {
      await call('devframes:plugin:data-inspector:saved:delete', id, scope)
    },
    write: (sourceId, request, options) =>
      call<WriteOutcome>('devframes:plugin:data-inspector:write', sourceId, request, options),
    onSourcesChanged: (listener) => {
      // The node side broadcasts this client event on register/unregister.
      client.client.register({
        name: 'devframes:plugin:data-inspector:sources:changed' as never,
        type: 'event',
        handler: listener,
      } as never)
    },
    onDataChanged: (listener) => {
      // The node side broadcasts this client event on writes and
      // source-driven change notifications, with the source id as payload.
      client.client.register({
        name: 'devframes:plugin:data-inspector:data:changed' as never,
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
    async queryPath(sourceId, query, path, options) {
      return runQueryAtPath(dataOf(sourceId), query, path, options)
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
    async write() {
      throw new Error('editing is unavailable in static mode')
    },
    onSourcesChanged: () => {}, // a static dataset never changes
    onDataChanged: () => {},
  }
}

// ── boot ─────────────────────────────────────────────────────────────

/**
 * Read and strip the pre-shared auth token the attach CLI appends to the SPA
 * URL (`?devframe_auth_token=…`), so it never lingers in the address bar or
 * history.
 */
function consumeAuthToken(): string | undefined {
  const params = new URLSearchParams(location.search)
  const token = params.get(DEVFRAME_AUTH_TOKEN_QUERY_PARAM)
  if (!token)
    return undefined
  params.delete(DEVFRAME_AUTH_TOKEN_QUERY_PARAM)
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
    rpcClient = client
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
