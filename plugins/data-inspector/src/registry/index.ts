/**
 * The data-source registry: how anything in the process hands the
 * data-inspector an object to query.
 *
 * The store is **process-global**, held under a `Symbol.for` key on
 * `globalThis`: registrations need no devframe context (register before any
 * context exists: CLI, inject endpoint, early setup code), duplicate copies of this
 * module converge on one store, and setup ordering can never drop a source.
 *
 * ```ts
 * import { registerDataSource } from '@devframes/plugin-data-inspector/registry'
 *
 * registerDataSource({
 *   id: 'my-plugin:state',
 *   title: 'My plugin state',
 *   data: () => state, // value or (async) factory
 * })
 * ```
 *
 * Integrations that prefer zero package dependency consume the same store
 * through the typed context service instead (see `DATA_SOURCES_SERVICE_ID`):
 *
 * ```ts
 * ctx.services.whenAvailable('devframes:plugin:data-inspector:sources', (sources) => {
 *   sources.register({ id: 'my-plugin:state', title: 'My state', data: () => state })
 * })
 * ```
 */
import type { DataSourceMeta, Query } from '../engine/contract'
import { diagnostics } from '../node/diagnostics'

export interface DataSourceEntry {
  /** Unique id; namespace it with your plugin id (`my-plugin:thing`). */
  id: string
  title: string
  description?: string
  /** Phosphor icon class shown in the source picker. */
  icon?: string
  /**
   * The data to inspect: a plain value, or a factory returning it (sync or
   * async). Live objects passed directly stay live, so queries read their
   * current state. Wrap functions you want to inspect in a factory.
   */
  data: unknown | (() => unknown | Promise<unknown>)
  /**
   * The resolved data never changes: the factory runs once and the settled
   * value is memoized (default `false`).
   */
  static?: boolean
  /**
   * Opt this source into live edits (default `false`): connected inspectors
   * may mutate the resolved object in place through the `write` RPC.
   * Contradicts `static: true`, since a memoized snapshot is read-only, so the
   * combination reports a diagnostic and stays read-only.
   */
  writable?: boolean
  /**
   * Bridge the source's own change signal: called with a `notify` function
   * that broadcasts a `data:changed` event to connected clients (same signal
   * a successful `write` emits). Return a dispose function to unhook; it runs
   * when the source is unregistered or replaced.
   */
  subscribe?: (notify: () => void) => (() => void) | void
  /** Suggested queries, surfaced read-only next to saved ones. */
  queries?: Query[]
}

/** Handle returned by `registerDataSource`, to notify clients or unregister. */
export interface DataSourceHandle {
  /** Broadcast that this source's data changed, so connected UIs re-run. */
  notifyChanged: () => void
  /** Remove this source from the registry. */
  unregister: () => void
}

/** The service provided on `ctx.services` (same store as the module API). */
export interface DataSourcesService {
  register: (entry: DataSourceEntry) => DataSourceHandle
  unregister: (id: string) => void
  list: () => DataSourceMeta[]
  get: (id: string) => DataSourceEntry | undefined
  onChanged: (listener: () => void) => () => void
  onDataChanged: (listener: (sourceId: string) => void) => () => void
}

/** Id under which the registry is provided on `ctx.services`. */
export const DATA_SOURCES_SERVICE_ID = 'devframes:plugin:data-inspector:sources'

declare module 'devframe' {
  interface DevframeServicesRegistry {
    'devframes:plugin:data-inspector:sources': DataSourcesService
  }
}

interface RegistryStore {
  entries: Map<string, DataSourceEntry>
  staticCache: Map<string, Promise<unknown>>
  listeners: Set<() => void>
  dataListeners: Set<(sourceId: string) => void>
  /** Dispose functions for wired `entry.subscribe` hooks, per source id. */
  subscriptions: Map<string, () => void>
}

const GLOBAL_KEY = Symbol.for('devframes:plugin:data-inspector:registry@1')

function store(): RegistryStore {
  const holder = globalThis as Record<PropertyKey, unknown>
  let value = holder[GLOBAL_KEY] as RegistryStore | undefined
  if (!value) {
    value = { entries: new Map(), staticCache: new Map(), listeners: new Set(), dataListeners: new Set(), subscriptions: new Map() }
    holder[GLOBAL_KEY] = value
  }
  // Stores minted by an older copy of this module may predate these fields.
  value.dataListeners ??= new Set()
  value.subscriptions ??= new Map()
  return value
}

function notify(registry: RegistryStore): void {
  for (const listener of registry.listeners)
    listener()
}

/** Broadcast that a source's data changed to every data-changed listener. */
export function notifyDataSourceChanged(id: string): void {
  const registry = store()
  for (const listener of registry.dataListeners)
    listener(id)
}

/** Effective writability of an entry: opt-in, and never on a static source. */
export function isWritableEntry(entry: DataSourceEntry): boolean {
  return (entry.writable ?? false) && !entry.static
}

function unwireSubscription(registry: RegistryStore, id: string): void {
  const dispose = registry.subscriptions.get(id)
  if (dispose) {
    registry.subscriptions.delete(id)
    try {
      dispose()
    }
    catch {}
  }
}

/** Register (or replace) a data source. Returns a handle to the registration. */
export function registerDataSource(entry: DataSourceEntry): DataSourceHandle {
  const registry = store()
  if (entry.static && entry.writable)
    diagnostics.DP_DATA_INSPECTOR_0004({ id: entry.id })
  unwireSubscription(registry, entry.id)
  registry.entries.set(entry.id, entry)
  registry.staticCache.delete(entry.id)
  const notifyChanged = (): void => notifyDataSourceChanged(entry.id)
  if (entry.subscribe) {
    const dispose = entry.subscribe(notifyChanged)
    if (dispose)
      registry.subscriptions.set(entry.id, dispose)
  }
  notify(registry)
  return {
    notifyChanged,
    unregister: () => unregisterDataSource(entry.id),
  }
}

export function unregisterDataSource(id: string): void {
  const registry = store()
  unwireSubscription(registry, id)
  if (registry.entries.delete(id)) {
    registry.staticCache.delete(id)
    notify(registry)
  }
}

export function listDataSources(): DataSourceMeta[] {
  return Array.from(store().entries.values()).map(entry => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    icon: entry.icon,
    static: entry.static ?? false,
    writable: isWritableEntry(entry),
    queries: entry.queries,
  }))
}

export function getDataSource(id: string): DataSourceEntry | undefined {
  return store().entries.get(id)
}

/** Resolve a source's data, honoring value-vs-factory and `static` memoization. */
export async function resolveSourceData(entry: DataSourceEntry): Promise<unknown> {
  if (typeof entry.data !== 'function')
    return entry.data
  const factory = entry.data as () => unknown | Promise<unknown>
  if (!entry.static)
    return factory()
  const registry = store()
  let cached = registry.staticCache.get(entry.id)
  if (!cached) {
    cached = Promise.resolve(factory())
    registry.staticCache.set(entry.id, cached)
    // A rejected factory must not poison the cache permanently.
    cached.catch(() => registry.staticCache.delete(entry.id))
  }
  return cached
}

/** Subscribe to registry changes (register/unregister). Returns unsubscribe. */
export function onDataSourcesChanged(listener: () => void): () => void {
  const registry = store()
  registry.listeners.add(listener)
  return () => {
    registry.listeners.delete(listener)
  }
}

/**
 * Subscribe to data-changed notifications (writes, `notifyChanged` handles,
 * `subscribe` bridges). The listener receives the source id.
 */
export function onDataSourceDataChanged(listener: (sourceId: string) => void): () => void {
  const registry = store()
  registry.dataListeners.add(listener)
  return () => {
    registry.dataListeners.delete(listener)
  }
}

/** Drop every registration and cache; a test isolation helper. */
export function resetDataSources(): void {
  const registry = store()
  for (const id of [...registry.subscriptions.keys()])
    unwireSubscription(registry, id)
  registry.entries.clear()
  registry.staticCache.clear()
  notify(registry)
}

/** The service implementation provided on `ctx.services` by `setup()`. */
export function createDataSourcesService(): DataSourcesService {
  return {
    register: registerDataSource,
    unregister: unregisterDataSource,
    list: listDataSources,
    get: getDataSource,
    onChanged: onDataSourcesChanged,
    onDataChanged: onDataSourceDataChanged,
  }
}
