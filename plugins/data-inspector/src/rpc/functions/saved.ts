import type { SavedQueryScope, SaveQueryInput } from '../../engine/contract'
import { deleteSavedQuery, listSavedQueries, saveQuery } from '../../node/saved-queries'
import { defineDataInspectorRpc, NS } from './_define'

export const savedList = defineDataInspectorRpc({
  name: `${NS}:saved:list`,
  type: 'query',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async () => listSavedQueries(ctx),
  }),
})

export const savedSave = defineDataInspectorRpc({
  name: `${NS}:saved:save`,
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (input: SaveQueryInput) => saveQuery(ctx, input),
  }),
})

export const savedDelete = defineDataInspectorRpc({
  name: `${NS}:saved:delete`,
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (id: string, scope: SavedQueryScope) => deleteSavedQuery(ctx, id, scope),
  }),
})
