/**
 * PROTOTYPE — throwaway code.
 *
 * The data-source registry pattern under validation: a `WeakMap` keyed by the
 * shared `DevframeNodeContext`, exactly like `plugins/git/src/rpc/context.ts`
 * and core's `node/hub-internals/context.ts`. Because every plugin's `setup()`
 * (and the host's `configureServer`) receive the SAME context object, anyone
 * can register live objects here and the data-viewer can find them — with no
 * dependency edge between contributor and viewer beyond this tiny module.
 */

export interface DataSourceMeta {
  id: string
  label: string
  description?: string
  /** Example queries surfaced in the UI as one-click chips. */
  examples?: string[]
}

export interface DataSourceEntry extends DataSourceMeta {
  /** Lazy getter so registration can precede the object's creation. */
  getObject: () => unknown
}

const registries = new WeakMap<object, Map<string, DataSourceEntry>>()

function sourcesFor(ctx: object): Map<string, DataSourceEntry> {
  let map = registries.get(ctx)
  if (!map) {
    map = new Map()
    registries.set(ctx, map)
  }
  return map
}

export function registerDataSource(ctx: object, entry: DataSourceEntry): void {
  sourcesFor(ctx).set(entry.id, entry)
}

export function listDataSources(ctx: object): DataSourceMeta[] {
  return Array.from(sourcesFor(ctx).values()).map(({ getObject: _, ...meta }) => meta)
}

export function getDataSource(ctx: object, id: string): DataSourceEntry | undefined {
  return sourcesFor(ctx).get(id)
}
