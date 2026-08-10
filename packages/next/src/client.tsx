'use client'

import type { ConnectionMeta } from 'devframe'
import type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'
import type { ReactNode } from 'react'
import { connectDevframe } from 'devframe/client'
import { createContext, useContext, useEffect, useState } from 'react'

export interface DevframeRpcState {
  /** The connected client, or `null` while the initial connect is in flight. */
  rpc: DevframeRpcClient | null
  /** Live connection status — `'connecting'` until the client resolves. */
  status: DevframeConnectionStatus
  /** The latest connection error, or `null`. */
  error: Error | null
}

const RpcContext = createContext<DevframeRpcState | null>(null)

const INITIAL: DevframeRpcState = { rpc: null, status: 'connecting', error: null }

export interface RpcProviderProps {
  children: ReactNode
  /**
   * Base URL the SPA discovers `__connection.json` under, relative to the
   * running page. Defaults to `'./'` (resolved against `document.baseURI`), so
   * a devframe mounted at `/__<id>/` connects without extra configuration.
   */
  baseURL?: string
  /**
   * Pre-resolved connection meta. Pass this to skip the `__connection.json`
   * fetch entirely (e.g. when the host already knows the WS endpoint).
   */
  connectionMeta?: ConnectionMeta
}

/**
 * Connect to the devframe RPC backend once and provide the client — plus live
 * connection status — to the tree. The React counterpart to `@devframes/nuxt`'s
 * client plugin.
 *
 * Children render immediately (before the connection resolves), so your shell
 * and a connection indicator stay visible throughout; read the client with
 * {@link useRpc} and the status with {@link useRpcStatus}.
 *
 * ```tsx
 * 'use client'
 * import { RpcProvider } from '@devframes/next/client'
 *
 * export function Providers({ children }: { children: React.ReactNode }) {
 *   return <RpcProvider baseURL="/__my-tool/">{children}</RpcProvider>
 * }
 * ```
 */
export function RpcProvider({
  children,
  baseURL = './',
  connectionMeta,
}: RpcProviderProps): ReactNode {
  const [state, setState] = useState<DevframeRpcState>(INITIAL)

  useEffect(() => {
    let active = true
    let client: DevframeRpcClient | undefined
    const sync = (): void => {
      if (active && client)
        setState({ rpc: client, status: client.status, error: client.connectionError })
    }

    const offs: Array<() => void> = []
    void connectDevframe({ baseURL, connectionMeta }).then(
      (c) => {
        if (!active)
          return
        client = c
        sync()
        offs.push(c.events.on('connection:status', sync))
        offs.push(c.events.on('connection:error', sync))
      },
      (err: unknown) => {
        if (active)
          setState({ rpc: null, status: 'error', error: err instanceof Error ? err : new Error(String(err)) })
      },
    )

    return () => {
      active = false
      for (const off of offs)
        off()
    }
    // `connectionMeta` is a plain descriptor; re-connect only when the base changes.
  }, [baseURL])

  return <RpcContext.Provider value={state}>{children}</RpcContext.Provider>
}

function useDevframeState(): DevframeRpcState {
  const state = useContext(RpcContext)
  if (!state)
    throw new Error('[@devframes/next] useRpc()/useRpcStatus() must be called inside a <RpcProvider>.')
  return state
}

/**
 * Read the connected {@link DevframeRpcClient}, or `null` while connecting.
 * Scope it to your tool's RPC namespace with `useRpc()?.scope('my-tool:')`.
 *
 * Throws when called outside a `<RpcProvider>`.
 */
export function useRpc(): DevframeRpcClient | null {
  return useDevframeState().rpc
}

/**
 * Read the live connection `status` and latest `error`, for a connection
 * indicator. Throws when called outside a `<RpcProvider>`.
 */
export function useRpcStatus(): { status: DevframeConnectionStatus, error: Error | null } {
  const { status, error } = useDevframeState()
  return { status, error }
}
