import type { DevframeRpcClient } from 'devframe/client'
import type {
  DevframeMessageEntry,
  DevframeMessageEntryInput,
  DevframeMessageHandle,
  DevframeMessageLevel,
  DevframeMessagesClient,
  DevframeMessageShortcutInput,
} from '../types/messages'

export interface MessagesClientOptions {
  /**
   * Default fields merged beneath every `add()` input — the client host passes
   * `{ category: entry.id }` to scope a dock client script's messages to its
   * entry. Fields set on the input itself win.
   */
  defaults?: Partial<DevframeMessageEntryInput>
}

/**
 * Build a browser-side {@link DevframeMessagesClient} that writes into the
 * hub's messages subsystem over the `hub:messages:*` built-in RPCs. The handle
 * returned by `add` proxies `update`/`dismiss` back through the same RPCs, so a
 * dock client script reports into the very feed the server writes to.
 */
export function createMessagesClient(rpc: DevframeRpcClient, options: MessagesClientOptions = {}): DevframeMessagesClient {
  // The `hub:messages:*` ids aren't in the statically-typed server map.
  const call = rpc.call as (name: string, ...args: any[]) => Promise<any>

  function makeHandle(entry: DevframeMessageEntry): DevframeMessageHandle {
    let current = entry
    return {
      get entry() {
        return current
      },
      get id() {
        return current.id
      },
      async update(patch) {
        const updated = await call('hub:messages:update', current.id, patch) as DevframeMessageEntry | undefined
        if (updated)
          current = updated
        return updated
      },
      dismiss: () => call('hub:messages:remove', current.id) as Promise<void>,
    }
  }

  async function add(input: DevframeMessageEntryInput): Promise<DevframeMessageHandle> {
    const entry = await call('hub:messages:add', { ...options.defaults, ...input }) as DevframeMessageEntry
    return makeHandle(entry)
  }

  function levelShortcut(level: DevframeMessageLevel) {
    return (message: string, extra?: DevframeMessageShortcutInput) =>
      add({ ...extra, message, level })
  }

  return {
    add,
    remove: id => call('hub:messages:remove', id) as Promise<void>,
    clear: () => call('hub:messages:clear') as Promise<void>,
    info: levelShortcut('info'),
    warn: levelShortcut('warn'),
    error: levelShortcut('error'),
    success: levelShortcut('success'),
    debug: levelShortcut('debug'),
  }
}
