import type { FilterOptions, QueryOutcome } from '../../engine/contract'
import { runQuery } from '../../engine/query-engine'
import { getDataSource, resolveSourceData } from '../../registry/index'
import { defineDataInspectorRpc, NS } from './_define'

/**
 * Execute a jora query against a registered source. Runs in-process against
 * the live object; the result is normalized to strict JSON (circulars ->
 * `$ref`, exotic types tagged, depth/entry caps) before it rides the wire.
 */
export const query = defineDataInspectorRpc({
  name: `${NS}:query`,
  type: 'query',
  jsonSerializable: true,
  agent: {
    title: 'Run a jora query',
    description: 'Execute a jora query against a registered data source and return the normalized result with stats.',
  },
  setup: () => ({
    handler: async (
      sourceId: string,
      joraQuery: string,
      options?: { maxDepth?: number, maxEntries?: number } & FilterOptions,
    ): Promise<QueryOutcome> => {
      const source = getDataSource(sourceId)
      if (!source)
        return { ok: false, error: { name: 'UnknownSource', message: `No data source "${sourceId}"` } }
      return runQuery(await resolveSourceData(source), joraQuery, options)
    },
  }),
})
