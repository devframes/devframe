'use client'

import type { DevframeRpcClient } from 'devframe/client'
import type { ConnectionMeta } from 'devframe/types'
import type { ReactNode } from 'react'
import { connectDevframe } from 'devframe/client'
import { createContext, useContext, useEffect, useState } from 'react'

const RpcContext = createContext<DevframeRpcClient | null>(null)

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
  /**
   * Rendered while the client is connecting. Children mount only once the RPC
   * client is ready, so {@link useRpc} always returns a live client. Defaults
   * to `null`.
   */
  fallback?: ReactNode
}

/**
 * Connect to the devframe RPC backend once and provide the client to the tree.
 *
 * The React counterpart to `@devframes/nuxt`'s client plugin: it calls
 * `connectDevframe()` on mount and exposes the result through {@link useRpc}.
 * Being a client component, drop it into a Next layout or page and read the
 * client from any descendant.
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
  fallback = null,
}: RpcProviderProps): ReactNode {
  const [rpc, setRpc] = useState<DevframeRpcClient | null>(null)

  useEffect(() => {
    let active = true
    void connectDevframe({ baseURL, connectionMeta }).then((client) => {
      if (active)
        setRpc(client)
    })
    return () => {
      active = false
    }
    // `connectionMeta` is a plain descriptor; re-connect only when the base changes.
  }, [baseURL])

  if (!rpc)
    return fallback

  return <RpcContext.Provider value={rpc}>{children}</RpcContext.Provider>
}

/**
 * Read the connected {@link DevframeRpcClient} provided by {@link RpcProvider}.
 * Scope it to your tool's RPC namespace with `useRpc().scope('my-tool:…')`.
 *
 * Throws when called outside a `<RpcProvider>`.
 */
export function useRpc(): DevframeRpcClient {
  const rpc = useContext(RpcContext)
  if (!rpc)
    throw new Error('[@devframes/next] useRpc() must be called inside a <RpcProvider>.')
  return rpc
}
