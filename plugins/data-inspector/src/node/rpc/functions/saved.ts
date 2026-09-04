import type { SavedQueryScope, SaveQueryInput } from '../../engine/contract'
import { defineRpcFunction } from 'devframe'
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
