import type { SuggestOutcome } from '../../engine/contract'
import { suggest as suggestQuery } from '../../engine/query-engine'
import { getDataSource, resolveSourceData } from '../../registry/index'
import { defineDataInspectorRpc, NS } from './_define'

/** Autocomplete: jora stat-mode suggestions at a cursor position. */
export const suggest = defineDataInspectorRpc({
  name: `${NS}:suggest`,
  type: 'query',
  jsonSerializable: true,
  setup: () => ({
    handler: async (sourceId: string, joraQuery: string, pos: number): Promise<SuggestOutcome> => {
      const source = getDataSource(sourceId)
      if (!source)
        return { ok: false, suggestions: [], statMs: 0, error: `No data source "${sourceId}"` }
      return suggestQuery(await resolveSourceData(source), joraQuery, pos)
    },
  }),
})
