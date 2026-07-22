import { reactive, shallowRef } from 'vue'

/** Minimal RPC surface the bridge needs. */
export interface ActionBridgeRpc {
  call: (method: string, ...args: unknown[]) => Promise<unknown>
}

export interface JsonRenderActionError {
  action: string
  error: unknown
}

export interface JsonRenderActionBridge {
  /** Handlers object handed to `JSONUIProvider` (a Proxy over all action names). */
  handlers: Record<string, (params?: Record<string, unknown>) => Promise<unknown>>
  /** Reactive per-action loading flags. */
  loading: Record<string, boolean>
  /** The most recent action failure, or `null`. */
  error: { value: JsonRenderActionError | null }
}

// Built-ins handled inside upstream's ActionProvider — never bridged to RPC.
const RESERVED = new Set(['setState', 'pushState', 'removeState', 'validateForm'])
// Promise-probe / symbol keys must not resolve to a phantom action.
const PROBES = new Set(['then', 'catch', 'finally'])

/**
 * The unrestricted action bridge: any spec action name is dispatched as an RPC
 * call of the same name (the current `vitejs/devtools` behavior — no
 * allowlist, no param schema). Unlike that proxy, this bridge tracks per-action
 * loading state and surfaces failures to the view instead of swallowing them to
 * the console.
 *
 * In static output (`interactive: false`) no RPC exists, so handlers reject
 * with a clear "unavailable in static output" error rather than hanging.
 */
export function createActionBridge(
  rpc: ActionBridgeRpc,
  options: { interactive?: boolean } = {},
): JsonRenderActionBridge {
  const interactive = options.interactive ?? true
  const loading = reactive<Record<string, boolean>>({})
  const error = shallowRef<JsonRenderActionError | null>(null)
  const cache = new Map<string, (params?: Record<string, unknown>) => Promise<unknown>>()

  function makeHandler(action: string) {
    let fn = cache.get(action)
    if (fn)
      return fn
    fn = async (params?: Record<string, unknown>) => {
      if (!interactive) {
        const err = new Error(`Action "${action}" is unavailable in static output`)
        error.value = { action, error: err }
        throw err
      }
      loading[action] = true
      try {
        return await rpc.call(action, params)
      }
      catch (err) {
        error.value = { action, error: err }
        throw err
      }
      finally {
        loading[action] = false
      }
    }
    cache.set(action, fn)
    return fn
  }

  const handlers = new Proxy({} as Record<string, (params?: Record<string, unknown>) => Promise<unknown>>, {
    has: (_t, prop) => typeof prop === 'string' && !RESERVED.has(prop) && !PROBES.has(prop),
    get: (_t, prop) => {
      if (typeof prop !== 'string' || RESERVED.has(prop) || PROBES.has(prop))
        return undefined
      return makeHandler(prop)
    },
  })

  return { handlers, loading, error }
}
