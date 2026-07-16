/**
 * PROTOTYPE — throwaway code.
 *
 * The data-source registry under validation: a `WeakMap` keyed by the shared
 * `DevframeNodeContext` (the `plugins/git/src/rpc/context.ts` idiom). Every
 * plugin's `setup()` and the host's `configureServer` receive the SAME context
 * object, so anyone can register sources dynamically — at setup time or later —
 * and the data-inspector finds them with no dependency edge beyond this module.
 */
import type { DataSourceMeta } from './rpc-contract'

export interface DataSourceEntry {
  id: string
  title: string
  description?: string
  /** Produce the object to query. Called per query unless `static`. */
  getData: () => unknown
  /** Data never changes; `getData()` is called once and memoized (default false). */
  static?: boolean
}

interface Registry {
  entries: Map<string, DataSourceEntry>
  /** Memoized `getData()` results for `static: true` sources. */
  staticCache: Map<string, unknown>
  listeners: Set<() => void>
}

const registries = new WeakMap<object, Registry>()

function registryFor(ctx: object): Registry {
  let registry = registries.get(ctx)
  if (!registry) {
    registry = { entries: new Map(), staticCache: new Map(), listeners: new Set() }
    registries.set(ctx, registry)
  }
  return registry
}

function notify(registry: Registry): void {
  for (const listener of registry.listeners)
    listener()
}

/** Register (or replace) a source. Returns an unregister function. */
export function registerDataSource(ctx: object, entry: DataSourceEntry): () => void {
  const registry = registryFor(ctx)
  registry.entries.set(entry.id, entry)
  registry.staticCache.delete(entry.id)
  notify(registry)
  return () => unregisterDataSource(ctx, entry.id)
}

export function unregisterDataSource(ctx: object, id: string): void {
  const registry = registryFor(ctx)
  if (registry.entries.delete(id)) {
    registry.staticCache.delete(id)
    notify(registry)
  }
}

export function listDataSources(ctx: object): DataSourceMeta[] {
  return Array.from(registryFor(ctx).entries.values()).map(entry => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    static: entry.static ?? false,
  }))
}

export function getDataSource(ctx: object, id: string): DataSourceEntry | undefined {
  return registryFor(ctx).entries.get(id)
}

/** Resolve a source's data, honoring `static` memoization. */
export function resolveSourceData(ctx: object, entry: DataSourceEntry): unknown {
  if (!entry.static)
    return entry.getData()
  const registry = registryFor(ctx)
  if (!registry.staticCache.has(entry.id))
    registry.staticCache.set(entry.id, entry.getData())
  return registry.staticCache.get(entry.id)
}

/** Subscribe to registry changes (register/unregister). Returns unsubscribe. */
export function onDataSourcesChanged(ctx: object, listener: () => void): () => void {
  const registry = registryFor(ctx)
  registry.listeners.add(listener)
  return () => registry.listeners.delete(listener)
}
