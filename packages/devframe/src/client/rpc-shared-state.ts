import type { RpcSharedStateGetOptions, RpcSharedStateHost } from 'devframe/types'
import type { SharedState, SharedStatePatch } from 'devframe/utils/shared-state'
import type { DevframeRpcClient } from './rpc'
import { nanoid } from 'devframe/utils/nanoid'
import { createSharedState } from 'devframe/utils/shared-state'
import { DEVFRAME_EVENTS } from '../events'

export function createRpcSharedStateClientHost(rpc: DevframeRpcClient): RpcSharedStateHost {
  const sharedState = new Map<string, SharedState<any>>()
  const stateDisposers = new Map<string, () => void>()
  const initialValues = new Map<string, any>()
  const keyAddedListeners = new Set<(key: string) => void>()
  const isStaticBackend = rpc.connectionMeta.backend === 'static'

  function mergeWithInitialValue(key: string, serverState: any): any {
    const initial = initialValues.get(key)
    if (initial && typeof initial === 'object' && !Array.isArray(initial)
      && typeof serverState === 'object' && !Array.isArray(serverState)) {
      return { ...initial, ...serverState }
    }
    return serverState
  }

  rpc.client.register({
    name: DEVFRAME_EVENTS.broadcast.clientStateUpdated,
    type: 'event',
    handler: (key: string, fullState: any, syncId: string) => {
      const state = sharedState.get(key)
      if (!state || state.syncIds.has(syncId))
        return
      state.mutate(() => mergeWithInitialValue(key, fullState), syncId)
    },
  })

  rpc.client.register({
    name: DEVFRAME_EVENTS.broadcast.clientStatePatch,
    type: 'event',
    handler: (key: string, patches: SharedStatePatch[], syncId: string) => {
      const state = sharedState.get(key)
      if (!state || state.syncIds.has(syncId))
        return
      state.patch(patches, syncId)
    },
  })

  function registerSharedState<T extends object>(key: string, state: SharedState<T>, initialSyncId?: string) {
    const offs: (() => void)[] = []
    offs.push(state.on('updated', (fullState, patches, syncId) => {
      if (isStaticBackend || syncId === initialSyncId)
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
          const initialState = state.value()
          const initialSyncId = nanoid()
          rpc.call('devframe:rpc:server-state:get', key)
            .then((serverState) => {
              // A pending read must not replace a newer update or a deleted state.
              if (serverState !== undefined && sharedState.get(key) === state && state.value() === initialState)
                state.mutate(() => mergeWithInitialValue(key, serverState), initialSyncId)
            })
            .catch((error) => {
              console.error('Error getting server state', error)
            })
          stateDisposers.set(key, registerSharedState(key, state, initialSyncId))
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

      return new Promise<SharedState<T>>((resolve, reject) => {
        if (!rpc.isTrusted) {
          resolve(state)
          let initialized = false
          rpc.events.on(DEVFRAME_EVENTS.client.isTrustedUpdated, (isTrusted) => {
            if (isTrusted && !initialized) {
              initialized = true
              initSharedState()
            }
          })
        }
        else {
          initSharedState().then(resolve, reject)
        }
      })
    },
  }
}
