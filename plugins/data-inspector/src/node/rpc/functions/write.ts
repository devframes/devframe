import type { WriteOutcome, WriteRequest } from '../../engine/contract'
import type { WriteApplyOptions } from '../../engine/write'
import { defineRpcFunction } from 'devframe'
import { applyWrite } from '../../engine/write'
import { getDataSource, isWritableEntry, notifyDataSourceChanged, resolveSourceData } from '../../registry/index'
import { NS } from './_define'

/**
 * Mutate a writable source's live object in place. Only sources that opted
 * in with `writable: true` accept writes; the path must address the source
 * root (identity view), and the same filter options the client viewed with
 * must be threaded through so array indices line up. Broadcasts
 * `data:changed` on success so every connected client refreshes.
 */
export const write = defineRpcFunction({
  name: `${NS}:write`,
  type: 'action',
  jsonSerializable: true,
  setup: () => ({
    handler: async (
      sourceId: string,
      request: WriteRequest,
      options?: WriteApplyOptions,
    ): Promise<WriteOutcome> => {
      const source = getDataSource(sourceId)
      if (!source)
        return { ok: false, error: { name: 'UnknownSource', message: `No data source "${sourceId}"` } }
      if (!isWritableEntry(source))
        return { ok: false, error: { name: 'ReadonlySource', message: `Data source "${sourceId}" is not writable` } }
      const outcome = applyWrite(await resolveSourceData(source), request, options)
      if (outcome.ok)
        notifyDataSourceChanged(sourceId)
      return outcome
    },
  }),
})
