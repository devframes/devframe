/** PROTOTYPE — saved-query CRUD state over the RPC surface. */
import type { SavedQuery, SaveQueryInput } from '../../rpc-contract'
import { ref } from 'vue'
import { call } from './rpc'

export function useSavedQueries() {
  const saved = ref<SavedQuery[]>([])

  async function refresh(): Promise<void> {
    saved.value = await call<SavedQuery[]>('data-inspector:saved:list')
  }

  async function save(input: SaveQueryInput): Promise<SavedQuery> {
    const record = await call<SavedQuery>('data-inspector:saved:save', input)
    await refresh()
    return record
  }

  async function remove(entry: SavedQuery): Promise<void> {
    await call('data-inspector:saved:delete', entry.id, entry.scope)
    await refresh()
  }

  return { saved, refresh, save, remove }
}

export type SavedQueriesApi = ReturnType<typeof useSavedQueries>
