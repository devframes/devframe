/** One-time import of private queries written by earlier Vite DevTools versions. */
import type { LegacyQueriesMode, LegacyQueriesReport } from '@devframes/plugin-data-inspector/engine'
import { ref } from 'vue'
import { backend } from './rpc'

export function useLegacyQueries() {
  const report = ref<LegacyQueriesReport>({ records: [], total: 0 })

  async function refresh(): Promise<void> {
    report.value = await backend().legacyList()
  }

  async function resolve(ids: string[], mode: LegacyQueriesMode): Promise<void> {
    report.value = await backend().legacyResolve(ids, mode)
  }

  return { report, refresh, resolve }
}
