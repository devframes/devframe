/** Saved-query CRUD state over the data backend. */
import type { SavedQuery, SaveQueryInput } from '../../engine'
import { ref } from 'vue'
import { backend } from './rpc'

export function useSavedQueries() {
  const saved = ref<SavedQuery[]>([])

  async function refresh(): Promise<void> {
    saved.value = await backend().savedList()
  }

  async function save(input: SaveQueryInput): Promise<SavedQuery> {
    const record = await backend().savedSave(input)
    await refresh()
    return record
  }

  async function remove(entry: SavedQuery): Promise<void> {
    await backend().savedDelete(entry.id, entry.scope)
    await refresh()
  }

  return { saved, refresh, save, remove }
}

export type SavedQueriesApi = ReturnType<typeof useSavedQueries>
