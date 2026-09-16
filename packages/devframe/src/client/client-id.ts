import { nanoid } from 'devframe/utils/nanoid'

const CLIENT_ID_STORAGE_KEY = 'devframe:client-id'
let memoryClientId: string | undefined

/**
 * This browser tab's stable client id: one nanoid per tab, persisted in
 * `sessionStorage` so it survives page reloads and RPC reconnects. The node
 * side uses it to tell connected tabs apart across reconnects (see #394).
 *
 * Tab duplication copies `sessionStorage`, so two tabs can briefly share an id
 * until per-tab disambiguation lands with the wider tab-metadata work.
 */
export function resolveClientId(win: Window | undefined = globalThis.window): string {
  try {
    const storage = win?.sessionStorage
    if (storage) {
      let id = storage.getItem(CLIENT_ID_STORAGE_KEY)
      if (!id) {
        id = nanoid()
        storage.setItem(CLIENT_ID_STORAGE_KEY, id)
      }
      return id
    }
  }
  catch {
    // Storage unavailable (sandboxed iframe, disabled cookies); fall through.
  }
  memoryClientId ??= nanoid()
  return memoryClientId
}
