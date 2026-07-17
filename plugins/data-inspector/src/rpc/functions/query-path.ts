import type { FilterOptions, NodePath, QueryOutcome } from '../../engine/contract'
import { runQueryAtPath } from '../../engine/query-engine'
import { getDataSource, resolveSourceData } from '../../registry/index'
import { defineDataInspectorRpc, NS } from './_define'

/**
 * Lazily expand a depth-truncated node. Re-runs the base jora query against
 * the live source, re-descends to the node addressed by `path` (a `NodePath`
 * lifted from the `$truncated: 'depth'` marker the client is expanding), and
 * returns just that subtree normalized with a fresh depth budget — so huge
 * graphs load a level at a time instead of all at once.
 */
export const queryPath = defineDataInspectorRpc({
  name: `${NS}:queryPath`,
  type: 'query',
  jsonSerializable: true,
  agent: {
    title: 'Expand a nested node',
    description: 'Re-run a jora query and return a fresh, depth-limited slice of the subtree at a given node path.',
  },
  setup: () => ({
    handler: async (
      sourceId: string,
      joraQuery: string,
      path: NodePath,
      options?: { maxDepth?: number, maxEntries?: number } & FilterOptions,
    ): Promise<QueryOutcome> => {
      const source = getDataSource(sourceId)
      if (!source)
        return { ok: false, error: { name: 'UnknownSource', message: `No data source "${sourceId}"` } }
      return runQueryAtPath(await resolveSourceData(source), joraQuery, path, options)
    },
  }),
})
