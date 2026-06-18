'use client'

import type { DevframeScopedClientContext } from 'devframe/client'
import type { ReactNode } from 'react'
import { connectDevframe } from 'devframe/client'
import { createContext, useContext, useEffect, useState } from 'react'

// Inlined (not imported from the server `rpc/index.ts`) so the client
// bundle stays free of node-only server code.
const NAMESPACE = 'next-runtime-snapshot'

export type SnapshotCtx = DevframeScopedClientContext<typeof NAMESPACE>

interface ConnectionState {
  ctx: SnapshotCtx | null
  error: string | null
}

const RpcContext = createContext<ConnectionState>({ ctx: null, error: null })

export function useRpc(): ConnectionState {
  return useContext(RpcContext)
}

export function RpcProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>({ ctx: null, error: null })

  useEffect(() => {
    let cancelled = false
    connectDevframe().then(
      (rpc) => {
        if (!cancelled)
          setState({ ctx: rpc.scope(NAMESPACE), error: null })
      },
      (err: unknown) => {
        if (cancelled)
          return
        const message = err instanceof Error ? err.message : String(err)
        setState({ ctx: null, error: message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return <RpcContext.Provider value={state}>{children}</RpcContext.Provider>
}
