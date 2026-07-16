/**
 * PROTOTYPE — throwaway code.
 *
 * The RPC surface a real data-inspector plugin would ship, modeled on
 * `plugins/inspect` (error envelopes, structured results). All results are
 * pre-normalized plain JSON, so `jsonSerializable: true` keeps the wire
 * strict and proves wire-safety on every call.
 */
import type { DevframeNodeContext } from 'devframe/types'
import type { QuerySettings, SavedQueryScope, SaveQueryInput, SkeletonOutcome } from './rpc-contract'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { runQuery, suggest } from './query-engine'
import { getDataSource, listDataSources, resolveSourceData } from './registry'
import { deleteSavedQuery, listSavedQueries, saveQuery } from './saved-queries'
import { skeletonOf } from './skeleton'

const defineRpc = createDefineWrapperWithContext<DevframeNodeContext>()

const NS = 'data-inspector'

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
    handler: async (sourceId: string, joraQuery: string, options?: { maxDepth?: number, maxEntries?: number } & QuerySettings) => {
      const source = getDataSource(ctx, sourceId)
      if (!source)
        return { ok: false as const, error: { name: 'UnknownSource', message: `No data source "${sourceId}"` } }
      return runQuery(resolveSourceData(ctx, source), joraQuery, options)
    },
  }),
})

export const skeletonFn = defineRpc({
  name: `${NS}:skeleton`,
  type: 'query',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (sourceId: string, options?: QuerySettings): Promise<SkeletonOutcome> => {
      const source = getDataSource(ctx, sourceId)
      if (!source)
        return { ok: false, error: { name: 'UnknownSource', message: `No data source "${sourceId}"` } }
      try {
        return { ok: true, ...skeletonOf(resolveSourceData(ctx, source), options) }
      }
      catch (error) {
        const e = error instanceof Error ? error : new Error(String(error))
        return { ok: false, error: { name: e.name, message: e.message } }
      }
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
      return suggest(resolveSourceData(ctx, source), joraQuery, pos)
    },
  }),
})

export const savedListFn = defineRpc({
  name: `${NS}:saved:list`,
  type: 'query',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async () => listSavedQueries(ctx),
  }),
})

export const savedSaveFn = defineRpc({
  name: `${NS}:saved:save`,
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (input: SaveQueryInput) => saveQuery(ctx, input),
  }),
})

export const savedDeleteFn = defineRpc({
  name: `${NS}:saved:delete`,
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (id: string, scope: SavedQueryScope) => deleteSavedQuery(ctx, id, scope),
  }),
})

export const allRpcFunctions = [sourcesFn, queryFn, skeletonFn, suggestFn, savedListFn, savedSaveFn, savedDeleteFn]
