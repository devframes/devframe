'use client'

import type { DevframeRpcClient } from 'devframe/client'
import type { ConnectionMeta } from 'devframe/types'
import type { ReactNode } from 'react'
import { connectDevframe } from 'devframe/client'
import { DEVFRAME_WS_ROUTE } from 'devframe/constants'
import { createContext, use, useEffect, useState } from 'react'

interface ConnectionState {
  rpc: DevframeRpcClient | null
  error: string | null
}

const RpcContext = createContext<ConnectionState>({ rpc: null, error: null })

export function useRpc(): ConnectionState {
  return use(RpcContext)
}

export function RpcProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>({ rpc: null, error: null })

  useEffect(() => {
    let cancelled = false
    // In combined dev (`pnpm dev`) the SPA is served by Next for HMR while
    // the RPC backend runs as a separate devframe server. This env var points
    // the client straight at that WebSocket; unset in production, where the
    // client discovers `./__connection.json` next to index.html.
    // Next.js statically inlines `process.env.NEXT_PUBLIC_*` at build time.
    // eslint-disable-next-line node/prefer-global/process
    const devWs = process.env.NEXT_PUBLIC_DEVFRAME_WS
    // A bare port (what `scripts/dev.mjs` sets) becomes a same-host socket on
    // the backend's WS route; a full `ws(s)://` URL is used verbatim.
    const websocket: ConnectionMeta['websocket'] | undefined = devWs
      ? (/^\d+$/.test(devWs) ? { port: Number(devWs), path: DEVFRAME_WS_ROUTE } : devWs)
      : undefined
    const options = websocket
      ? { connectionMeta: { backend: 'websocket' as const, websocket } }
      : undefined
    connectDevframe(options).then(
      (rpc) => {
        if (!cancelled)
          setState({ rpc, error: null })
      },
      (err: unknown) => {
        if (cancelled)
          return
        const message = err instanceof Error ? err.message : String(err)
        setState({ rpc: null, error: message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return <RpcContext value={state}>{children}</RpcContext>
}
