import type { DevframeMessageEntryInput, DevframeMessageHandle, DevframeMessagesClient } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'

export function createClientMessagesClient(rpc: DevframeRpcClient): DevframeMessagesClient {
  const buffer: (() => Promise<void>)[] = []
  let flushing: Promise<void> | undefined

  async function flush() {
    if (rpc.isTrusted !== true)
      return
    if (flushing === undefined) {
      // eslint-disable-next-line no-async-promise-executor
      flushing = new Promise(async (resolve) => {
        while (buffer.length > 0) {
          const op = buffer.shift()!
          await op()
        }
        resolve()
      })
    }
    return flushing
  }

  async function enqueue<T>(op: () => Promise<T>): Promise<T> {
    if (rpc.isTrusted === true && buffer.length !== 0)
      await flush()

    if (rpc.isTrusted === true && buffer.length === 0)
      return await op()

    return new Promise<T>((resolve) => {
      buffer.push(async () => {
        const result = await op()
        resolve(result)
      })
    })
  }

  rpc.events.on('rpc:is-trusted:updated', (isTrusted) => {
    if (isTrusted && buffer.length > 0)
      flush()
  })

  const client: DevframeMessagesClient = {
    add(input: DevframeMessageEntryInput): Promise<DevframeMessageHandle> {
      return enqueue(async () => {
        let entry = await rpc.call('hub:messages:add', input)
        return {
          get entry() { return entry },
          get id() { return entry.id },
          async update(patch: Partial<DevframeMessageEntryInput>) {
            const updated = await rpc.call('hub:messages:update', entry.id, patch)
            if (updated)
              entry = updated
            return updated ?? undefined
          },
          async dismiss() {
            await rpc.call('hub:messages:remove', entry.id)
          },
        }
      })
    },
    remove(id: string): Promise<void> {
      return enqueue(() => rpc.call('hub:messages:remove', id))
    },
    clear(): Promise<void> {
      return enqueue(() => rpc.call('hub:messages:clear'))
    },
    /** Level shortcuts: `messages.info('...')` is `add({ message, level: 'info', ...extra })`. */
    info: (message, extra) => client.add({ ...extra, message, level: 'info' }),
    warn: (message, extra) => client.add({ ...extra, message, level: 'warn' }),
    error: (message, extra) => client.add({ ...extra, message, level: 'error' }),
    success: (message, extra) => client.add({ ...extra, message, level: 'success' }),
    debug: (message, extra) => client.add({ ...extra, message, level: 'debug' }),
  }
  return client
}
