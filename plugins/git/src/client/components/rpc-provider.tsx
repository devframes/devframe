'use client'

import type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'
import type { ConnectionMeta } from 'devframe/types'
import type { ReactNode } from 'react'
import { connectDevframe } from 'devframe/client'
import { DEVFRAME_WS_ROUTE } from 'devframe/constants'
import { createContext, use, useEffect, useState } from 'react'

interface ConnectionState {
  rpc: DevframeRpcClient | null
  status: DevframeConnectionStatus
  error: string | null
}

const RpcContext = createContext<ConnectionState>({ rpc: null, status: 'connecting', error: null })

export function useRpc(): ConnectionState {
  return use(RpcContext)
}

export function RpcProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>({ rpc: null, status: 'connecting', error: null })

  useEffect(() => {
    let cancelled = false
    let off: (() => void) | undefined
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
        if (cancelled)
          return
        setState({ rpc, status: rpc.status, error: rpc.connectionError?.message ?? null })
        // Track the live connection so a mid-session drop or auth refusal
        // swaps the UI to a clear state instead of leaving stale data on screen.
        off = rpc.events.on('connection:status', (status) => {
          setState({ rpc, status, error: rpc.connectionError?.message ?? null })
        })
      },
      (err: unknown) => {
        if (cancelled)
          return
        // Failing to even load the connection meta is a fatal connection error.
        const message = err instanceof Error ? err.message : String(err)
        setState({ rpc: null, status: 'error', error: message })
      },
    )
    return () => {
      cancelled = true
      off?.()
    }
  }, [])

  return <RpcContext value={state}>{children}</RpcContext>
}
