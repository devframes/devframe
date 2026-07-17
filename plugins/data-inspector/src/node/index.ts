import type { DevframeNodeContext } from 'devframe/types'
import { createDataSourcesService, DATA_SOURCES_SERVICE_ID, getDataSource, onDataSourcesChanged, registerDataSource } from '../registry/index'
import { serverFunctions } from '../rpc/index'
import { createExampleDataSource, EXAMPLE_SOURCE_ID } from './example-source'

/** Broadcast whenever the source registry changes (register/unregister). */
export const SOURCES_CHANGED_EVENT = 'devframes:plugin:data-inspector:sources:changed'

export interface SetupDataInspectorOptions {
  /** Register the built-in example source (default `true`). */
  exampleSource?: boolean
}

/**
 * Register the data-inspector's RPC functions on a devframe node context,
 * provide the source registry as a typed context service, and broadcast
 * registry changes so connected UIs refresh their source list live.
 *
 * Called from the definition's `setup(ctx)` and reusable by host adapters
 * (the CLI and the in-process agent wire their own contexts through this).
 */
export function setupDataInspector(ctx: DevframeNodeContext, options: SetupDataInspectorOptions = {}): void {
  for (const fn of serverFunctions)
    ctx.rpc.register(fn)

  // The registry itself is process-global; the service is the typed,
  // zero-dependency access path for other integrations on this context.
  if (!ctx.services.has(DATA_SOURCES_SERVICE_ID))
    ctx.services.provide(DATA_SOURCES_SERVICE_ID, createDataSourcesService())

  // Always on unless opted out: the example source doubles as an
  // environment inspector (this context, OS, live process stats).
  if ((options.exampleSource ?? true) && !getDataSource(EXAMPLE_SOURCE_ID))
    registerDataSource(createExampleDataSource(ctx))

  onDataSourcesChanged(() => {
    ctx.rpc.broadcast(SOURCES_CHANGED_EVENT as never)
  })
}

export { createExampleDataSource, EXAMPLE_SOURCE_ID }
export { serverFunctions }
