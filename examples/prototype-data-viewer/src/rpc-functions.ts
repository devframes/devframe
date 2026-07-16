/**
 * PROTOTYPE — throwaway code.
 *
 * The three RPC functions a real data-viewer plugin would ship, modeled on
 * `plugins/inspect`'s `invoke` (error envelope, structured result). All
 * results are pre-normalized to plain JSON, so `jsonSerializable: true`
 * keeps the wire strict and proves wire-safety on every call.
 */
import type { DevframeNodeContext } from 'devframe/types'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { runQuery, suggest } from './query-engine'
import { getDataSource, listDataSources } from './registry'

const defineRpc = createDefineWrapperWithContext<DevframeNodeContext>()

const NS = 'data-viewer-proto'

export const sourcesFn = defineRpc({
  name: `${NS}:sources`,
  type: 'query',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async () => listDataSources(ctx),
  }),
})

export const queryFn = defineRpc({
  name: `${NS}:query`,
  type: 'query',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (sourceId: string, joraQuery: string, options?: { maxDepth?: number, maxEntries?: number }) => {
      const source = getDataSource(ctx, sourceId)
      if (!source)
        return { ok: false as const, error: { name: 'UnknownSource', message: `No data source "${sourceId}"` } }
      return runQuery(source.getObject(), joraQuery, options)
    },
  }),
})

export const suggestFn = defineRpc({
  name: `${NS}:suggest`,
  type: 'query',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (sourceId: string, joraQuery: string, pos: number) => {
      const source = getDataSource(ctx, sourceId)
      if (!source)
        return { ok: false, suggestions: [], statMs: 0, error: `No data source "${sourceId}"` }
      return suggest(source.getObject(), joraQuery, pos)
    },
  }),
})

export const allRpcFunctions = [sourcesFn, queryFn, suggestFn]
