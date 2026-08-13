import type { RpcSharedStateGetOptions, RpcSharedStateHost } from 'devframe/types'
import type { SharedState, SharedStatePatch } from 'devframe/utils/shared-state'
import type { DevframeRpcClient } from './rpc'
import { createSharedState } from 'devframe/utils/shared-state'

/**
 * Upper bound on remembered server-originated syncIds. An update's own
 * `updated` event fires synchronously after it is applied, so the set only
 * needs to outlive the brief window between applying a server update and
 * observing its emission — 100 comfortably covers a burst.
 */
const MAX_REMOTE_SYNC_IDS = 100

export function createRpcSharedStateClientHost(rpc: DevframeRpcClient): RpcSharedStateHost {
  const sharedState = new Map<string, SharedState<any>>()
  const stateDisposers = new Map<string, () => void>()
  const initialValues = new Map<string, any>()
  const keyAddedListeners = new Set<(key: string) => void>()
  const isStaticBackend = rpc.connectionMeta.backend === 'static'

  // Server-originated syncIds, so the forwarding listener below can tell a
  // local mutation (forward it to the server) from an applied server update
  // (already the server's own — forwarding it back would be a pure echo the
  // server discards, at the cost of one wire message per update; over the
  // SSE transport that's a whole HTTP POST per server-side state tick).
  const remoteSyncIds = new Set<string>()
  function rememberRemoteSyncId(syncId: string): void {
    remoteSyncIds.add(syncId)
    if (remoteSyncIds.size > MAX_REMOTE_SYNC_IDS) {
      const oldest = remoteSyncIds.values().next().value
      if (oldest !== undefined)
        remoteSyncIds.delete(oldest)
    }
  }

  function mergeWithInitialValue(key: string, serverState: any): any {
    const initial = initialValues.get(key)
    if (initial && typeof initial === 'object' && !Array.isArray(initial)
      && typeof serverState === 'object' && !Array.isArray(serverState)) {
      return { ...initial, ...serverState }
    }
    return serverState
  }

  rpc.client.register({
    name: 'devframe:rpc:client-state:updated',
    type: 'event',
    handler: (key: string, fullState: any, syncId: string) => {
      const state = sharedState.get(key)
      if (!state || state.syncIds.has(syncId))
        return
      rememberRemoteSyncId(syncId)
      state.mutate(() => mergeWithInitialValue(key, fullState), syncId)
    },
  })

  rpc.client.register({
    name: 'devframe:rpc:client-state:patch',
    type: 'event',
    handler: (key: string, patches: SharedStatePatch[], syncId: string) => {
      const state = sharedState.get(key)
      if (!state || state.syncIds.has(syncId))
        return
      rememberRemoteSyncId(syncId)
      state.patch(patches, syncId)
    },
  })

  function registerSharedState<T extends object>(key: string, state: SharedState<T>) {
    const offs: (() => void)[] = []
    offs.push(state.on('updated', (fullState, patches, syncId) => {
      if (isStaticBackend)
        return
      // An update the server just sent needs no reflection back to it.
      if (remoteSyncIds.has(syncId))
        return
      if (patches) {
        rpc.callEvent('devframe:rpc:server-state:patch', key, patches, syncId)
      }
      else {
        rpc.callEvent('devframe:rpc:server-state:set', key, fullState, syncId)
      }
    }))

    return () => {
      for (const off of offs) {
        off()
      }
    }
  }

  return {
    keys: () => Array.from(sharedState.keys()),
    onKeyAdded(fn) {
      keyAddedListeners.add(fn)
      return () => {
        keyAddedListeners.delete(fn)
      }
    },
    delete(key) {
      const dispose = stateDisposers.get(key)
      stateDisposers.delete(key)
      const existed = sharedState.delete(key)
      initialValues.delete(key)
      dispose?.()
      return existed
    },
    get: async <T extends object>(key: string, options?: RpcSharedStateGetOptions<T>) => {
      if (options?.initialValue !== undefined) {
        initialValues.set(key, options.initialValue)
      }
      if (sharedState.has(key)) {
        return sharedState.get(key)!
      }

      const state = createSharedState<T>({
        initialValue: options?.initialValue as T,
        enablePatches: false,
      })

      async function initSharedState() {
        if (!isStaticBackend) {
          rpc.callEvent('devframe:rpc:server-state:subscribe', key)
        }
        if (options?.initialValue !== undefined) {
          sharedState.set(key, state)
          for (const fn of keyAddedListeners)
            fn(key)
          rpc.call('devframe:rpc:server-state:get', key)
            .then((serverState) => {
              if (serverState !== undefined)
                state.mutate(() => mergeWithInitialValue(key, serverState))
            })
            .catch((error) => {
              console.error('Error getting server state', error)
            })
          stateDisposers.set(key, registerSharedState(key, state))
          return state
        }
        else {
          const serverValue = await rpc.call('devframe:rpc:server-state:get', key) as T
          state.mutate(() => mergeWithInitialValue(key, serverValue))
          sharedState.set(key, state)
          for (const fn of keyAddedListeners)
            fn(key)
          stateDisposers.set(key, registerSharedState(key, state))
          return state
        }
      }

      return new Promise<SharedState<T>>((resolve) => {
        if (!rpc.isTrusted) {
          resolve(state)
          let initialized = false
          rpc.events.on('rpc:is-trusted:updated', (isTrusted) => {
            if (isTrusted && !initialized) {
              initialized = true
              initSharedState()
            }
          })
        }
        else {
          initSharedState().then(resolve)
        }
      })
    },
  }
}
