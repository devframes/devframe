import type { FilterOptions, SkeletonOutcome } from '../../engine/contract'
import { skeletonOf } from '../../engine/skeleton'
import { getDataSource, resolveSourceData } from '../../registry/index'
import { defineDataInspectorRpc, NS } from './_define'

/** The type skeleton of a source ("what data are available"), query-independent. */
export const skeleton = defineDataInspectorRpc({
  name: `${NS}:skeleton`,
  type: 'query',
  jsonSerializable: true,
  setup: () => ({
    handler: async (sourceId: string, options?: FilterOptions): Promise<SkeletonOutcome> => {
      const source = getDataSource(sourceId)
      if (!source)
        return { ok: false, error: { name: 'UnknownSource', message: `No data source "${sourceId}"` } }
      try {
        return { ok: true, ...skeletonOf(await resolveSourceData(source), options) }
      }
      catch (error) {
        const e = error instanceof Error ? error : new Error(String(error))
        return { ok: false, error: { name: e.name, message: e.message } }
      }
    },
  }),
})
