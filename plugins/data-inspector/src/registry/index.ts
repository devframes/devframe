/**
 * The data-source registry — how anything in the process hands the
 * data-inspector an object to query.
 *
 * The store is **process-global**, held under a `Symbol.for` key on
 * `globalThis`: registrations need no devframe context (register before any
 * context exists — CLI, agent, early plugin code), duplicate copies of this
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

export interface DataSourceEntry {
  /** Unique id — namespace it with your plugin id (`my-plugin:thing`). */
  id: string
  title: string
  description?: string
  /** Phosphor icon class shown in the source picker. */
  icon?: string
  /**
   * The data to inspect: a plain value, or a factory returning it (sync or
   * async). Live objects passed directly stay live — queries read their
   * current state. Wrap functions you want to inspect in a factory.
   */
  data: unknown | (() => unknown | Promise<unknown>)
  /**
   * The resolved data never changes: the factory runs once and the settled
   * value is memoized (default `false`).
   */
  static?: boolean
  /** Suggested queries, surfaced read-only next to saved ones. */
  queries?: Query[]
}

/** The service provided on `ctx.services` (same store as the module API). */
export interface DataSourcesService {
  register: (entry: DataSourceEntry) => () => void
  unregister: (id: string) => void
  list: () => DataSourceMeta[]
  get: (id: string) => DataSourceEntry | undefined
  onChanged: (listener: () => void) => () => void
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
}

const GLOBAL_KEY = Symbol.for('devframes:plugin:data-inspector:registry@1')

function store(): RegistryStore {
  const holder = globalThis as Record<PropertyKey, unknown>
  let value = holder[GLOBAL_KEY] as RegistryStore | undefined
  if (!value) {
    value = { entries: new Map(), staticCache: new Map(), listeners: new Set() }
    holder[GLOBAL_KEY] = value
  }
  return value
}

function notify(registry: RegistryStore): void {
  for (const listener of registry.listeners)
    listener()
}

/** Register (or replace) a data source. Returns an unregister function. */
export function registerDataSource(entry: DataSourceEntry): () => void {
  const registry = store()
  registry.entries.set(entry.id, entry)
  registry.staticCache.delete(entry.id)
  notify(registry)
  return () => unregisterDataSource(entry.id)
}

export function unregisterDataSource(id: string): void {
  const registry = store()
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

/** Drop every registration and cache — test isolation helper. */
export function resetDataSources(): void {
  const registry = store()
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
  }
}
