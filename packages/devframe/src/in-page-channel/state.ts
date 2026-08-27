import type { SharedState, SharedStatePatch } from 'devframe/utils/shared-state'
import type { InPageChannelProtocol, InPageSharedStateHost } from './types'
import { nanoid } from 'devframe/utils/nanoid'
import { createSharedState } from 'devframe/utils/shared-state'
import { DEVFRAME_EVENTS } from '../events'
import { InPageChannelError } from './internal'

/**
 * The channel shared-state layer — `createSharedState` pumped over the
 * in-page channel, mirroring the RPC shared-state wire design with the page
 * script playing the server's role: it owns the canonical value, replays a
 * snapshot to every (re)subscribing panel, and fans syncId-deduplicated
 * updates out to the panels subscribed to each key.
 *
 * Request endpoints (panel → page script) are defined here at their
 * handlers, like the RPC layer's `devframe:rpc:server-state:*`; the
 * page-script → panel notifications live in `DEVFRAME_EVENTS.inPageChannel`.
 */
const IN_PAGE_STATE_RPC = {
  /** Subscribe to a key; returns the authority's current snapshot. */
  subscribe: 'devframe:in-page:page-state:subscribe',
  /** Replace a key's value (panel mutation forwarded up). */
  set: 'devframe:in-page:page-state:set',
  /** Patch a key's value (panel mutation forwarded up). */
  patch: 'devframe:in-page:page-state:patch',
} as const

type InternalHandlers = Record<string, (...args: any[]) => unknown>

export interface PageScriptStatePeer {
  /** Keys this panel subscribed to. */
  readonly subscribedStates: Set<string>
  /** Fire-and-forget raw send to this panel (missing handlers are ignored). */
  callEventRaw: (method: string, args: unknown[]) => void
}

export interface PageScriptStateHost<P extends InPageChannelProtocol> extends InPageSharedStateHost<P> {
  /** State handlers bound to one panel peer (its subscribe/set/patch). */
  createPeerHandlers: (peer: PageScriptStatePeer) => InternalHandlers
}

/** The page-script (authority) half of the channel shared-state layer. */
export function createPageScriptStateHost<P extends InPageChannelProtocol>(
  peers: () => Iterable<PageScriptStatePeer>,
): PageScriptStateHost<P> {
  const states = new Map<string, SharedState<any>>()

  return {
    get: async <T extends object>(key: string, options?: { initialValue?: T }) => {
      const existing = states.get(key)
      if (existing)
        return existing as SharedState<any>
      if (options?.initialValue === undefined) {
        throw new InPageChannelError(
          'state-uninitialized',
          `in-page shared state "${key}" was accessed before initialization — the page script is the authority, so its first \`sharedState.get("${key}")\` must provide \`initialValue\``,
        )
      }
      const state = createSharedState<T>({
        initialValue: options.initialValue,
        enablePatches: true,
      })
      states.set(key, state)
      state.on('updated', (fullState, patches, syncId) => {
        for (const peer of peers()) {
          if (!peer.subscribedStates.has(key))
            continue
          if (patches)
            peer.callEventRaw(DEVFRAME_EVENTS.inPageChannel.panelStatePatch, [key, patches, syncId])
          else
            peer.callEventRaw(DEVFRAME_EVENTS.inPageChannel.panelStateUpdated, [key, fullState, syncId])
        }
      })
      return state
    },
    createPeerHandlers(peer) {
      return {
        [IN_PAGE_STATE_RPC.subscribe]: (key: string) => {
          peer.subscribedStates.add(key)
          return states.get(key)?.value()
        },
        [IN_PAGE_STATE_RPC.set]: (key: string, fullState: object, syncId: string) => {
          const state = states.get(key)
          if (state && !state.syncIds.has(syncId))
            state.mutate(() => fullState as any, syncId)
        },
        [IN_PAGE_STATE_RPC.patch]: (key: string, patches: SharedStatePatch[], syncId: string) => {
          states.get(key)?.patch(patches, syncId)
        },
      }
    },
  }
}

export interface PanelStateHostOptions {
  /** Buffered fire-and-forget to the page script. */
  callEvent: (method: string, args: unknown[]) => void
  /** Request/response to the page script (buffered while connecting). */
  call: (method: string, args: unknown[]) => Promise<unknown>
  isConnected: () => boolean
}

export interface PanelStateHost<P extends InPageChannelProtocol> extends InPageSharedStateHost<P> {
  /** Handlers for the authority's update notifications. */
  readonly handlers: InternalHandlers
  /** (Re)subscribe every known key — call on each `connected` transition. */
  resubscribe: () => void
}

/** The panel (mirror) half of the channel shared-state layer. */
export function createPanelStateHost<P extends InPageChannelProtocol>(
  options: PanelStateHostOptions,
): PanelStateHost<P> {
  const states = new Map<string, SharedState<any>>()
  const seeded = new Set<string>()
  const seedWaiters = new Map<string, (() => void)[]>()
  /**
   * SyncIds of snapshot adoptions. Adopting the authority's replay must not
   * echo straight back up as a `set` — the authority already has the value.
   */
  const adoptedSyncIds = new Set<string>()

  function markSeeded(key: string): void {
    seeded.add(key)
    const waiters = seedWaiters.get(key)
    if (waiters) {
      seedWaiters.delete(key)
      for (const resolve of waiters)
        resolve()
    }
  }

  function adopt(key: string, snapshot: unknown): void {
    const state = states.get(key)
    if (state && snapshot !== undefined) {
      const syncId = nanoid()
      adoptedSyncIds.add(syncId)
      state.mutate(() => snapshot as any, syncId)
    }
    markSeeded(key)
  }

  function subscribeNow(key: string): void {
    options.call(IN_PAGE_STATE_RPC.subscribe, [key])
      .then(snapshot => adopt(key, snapshot))
      .catch((error) => {
        console.warn(`[devframe] in-page shared state "${key}": subscribe failed`, error)
      })
  }

  return {
    handlers: {
      [DEVFRAME_EVENTS.inPageChannel.panelStateUpdated]: (key: string, fullState: object, syncId: string) => {
        const state = states.get(key)
        if (state && !state.syncIds.has(syncId))
          state.mutate(() => fullState as any, syncId)
        markSeeded(key)
      },
      [DEVFRAME_EVENTS.inPageChannel.panelStatePatch]: (key: string, patches: SharedStatePatch[], syncId: string) => {
        states.get(key)?.patch(patches, syncId)
        markSeeded(key)
      },
    },
    resubscribe() {
      for (const key of states.keys())
        subscribeNow(key)
    },
    get: <T extends object>(key: string, getOptions?: { initialValue?: T }) => {
      const existing = states.get(key)
      if (existing) {
        return Promise.resolve(existing as SharedState<any>)
      }
      const state = createSharedState<T>({
        // Without an initial value the state stays empty until the
        // authority's first replay resolves the returned promise.
        initialValue: getOptions?.initialValue as T,
        enablePatches: true,
      })
      states.set(key, state)
      state.on('updated', (fullState, patches, syncId) => {
        if (adoptedSyncIds.delete(syncId))
          return
        // Mutations while disconnected are local-only; on reconnect the
        // panel re-adopts the authority's snapshot.
        if (!options.isConnected())
          return
        if (patches)
          options.callEvent(IN_PAGE_STATE_RPC.patch, [key, patches, syncId])
        else
          options.callEvent(IN_PAGE_STATE_RPC.set, [key, fullState, syncId])
      })
      // While connecting, the endpoint's `resubscribe()` on the next
      // `connected` transition performs the initial subscribe instead.
      if (options.isConnected())
        subscribeNow(key)
      if (getOptions?.initialValue !== undefined)
        return Promise.resolve(state as SharedState<any>)
      return new Promise<SharedState<any>>((resolve) => {
        if (seeded.has(key)) {
          resolve(state)
          return
        }
        const waiters = seedWaiters.get(key) ?? []
        waiters.push(() => resolve(state))
        seedWaiters.set(key, waiters)
      })
    },
  }
}
