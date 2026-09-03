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
   * Default fields merged beneath every `add()` input. The client host passes
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
  // A static backend has no messages host to write into: keep handles local
  // so a client script that reports as it goes (e.g. the a11y page script
  // mirroring scans) runs unchanged against a static build.
  if (rpc.connectionMeta?.backend === 'static')
    return createLocalMessagesClient(options)

  const { call } = rpc

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
        const updated = await call('hub:messages:update', current.id, patch)
        if (updated)
          current = updated
        return updated
      },
      dismiss: () => call('hub:messages:remove', current.id),
    }
  }

  async function add(input: DevframeMessageEntryInput): Promise<DevframeMessageHandle> {
    const entry = await call('hub:messages:add', { ...options.defaults, ...input })
    return makeHandle(entry)
  }

  function levelShortcut(level: DevframeMessageLevel) {
    return (message: string, extra?: DevframeMessageShortcutInput) =>
      add({ ...extra, message, level })
  }

  return {
    add,
    remove: id => call('hub:messages:remove', id),
    clear: () => call('hub:messages:clear'),
    info: levelShortcut('info'),
    warn: levelShortcut('warn'),
    error: levelShortcut('error'),
    success: levelShortcut('success'),
    debug: levelShortcut('debug'),
  }
}

/** In-page-only writes for a static backend: same surface, no wire. */
function createLocalMessagesClient(options: MessagesClientOptions): DevframeMessagesClient {
  let nextId = 0

  function makeEntry(input: DevframeMessageEntryInput): DevframeMessageEntry {
    return {
      timestamp: Date.now(),
      ...options.defaults,
      ...input,
      id: input.id ?? `local-${++nextId}`,
      from: 'browser',
    }
  }

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
        current = { ...current, ...patch, id: current.id, from: current.from }
        return current
      },
      dismiss: async () => {},
    }
  }

  const add = async (input: DevframeMessageEntryInput): Promise<DevframeMessageHandle> => makeHandle(makeEntry(input))
  function levelShortcut(level: DevframeMessageLevel) {
    return (message: string, extra?: DevframeMessageShortcutInput) =>
      add({ ...extra, message, level })
  }
  return {
    add,
    remove: async () => {},
    clear: async () => {},
    info: levelShortcut('info'),
    warn: levelShortcut('warn'),
    error: levelShortcut('error'),
    success: levelShortcut('success'),
    debug: levelShortcut('debug'),
  }
}
