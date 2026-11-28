import type { LegacyQueriesMode, SavedQueryScope, SaveQueryInput } from '../../engine/contract'
import { defineRpcFunction } from 'devframe'
import { listLegacyQueries, resolveLegacyQueries } from '../../legacy-queries'
import { deleteSavedQuery, listSavedQueries, saveQuery } from '../../saved-queries'
import { NS } from './_define'

export const savedList = defineRpcFunction({
  name: `${NS}:saved:list`,
  type: 'query',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async () => listSavedQueries(ctx),
  }),
})

export const savedSave = defineRpcFunction({
  name: `${NS}:saved:save`,
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (input: SaveQueryInput) => saveQuery(ctx, input),
  }),
})

export const savedDelete = defineRpcFunction({
  name: `${NS}:saved:delete`,
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (id: string, scope: SavedQueryScope) => deleteSavedQuery(ctx, id, scope),
  }),
})

/** Unclaimed records from the pre-scope-split machine-wide queries file. */
export const savedLegacyList = defineRpcFunction({
  name: `${NS}:saved:legacy:list`,
  type: 'query',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async () => listLegacyQueries(ctx),
  }),
})

/** Claim the selected legacy records into this project, or discard them. */
export const savedLegacyResolve = defineRpcFunction({
  name: `${NS}:saved:legacy:resolve`,
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (ids: readonly string[], mode: LegacyQueriesMode) => resolveLegacyQueries(ctx, ids, mode),
  }),
})
