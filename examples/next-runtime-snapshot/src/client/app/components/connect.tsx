'use client'

import type { DevToolsRpcClient } from 'devframe/client'
import type { ReactNode } from 'react'
import { connectDevframe } from 'devframe/client'
import { createContext, useContext, useEffect, useState } from 'react'

interface ConnectionState {
  rpc: DevToolsRpcClient | null
  error: string | null
}

const RpcContext = createContext<ConnectionState>({ rpc: null, error: null })

export function useRpc(): ConnectionState {
  return useContext(RpcContext)
}

export function RpcProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>({ rpc: null, error: null })

  useEffect(() => {
    let cancelled = false
    connectDevframe().then(
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

  return <RpcContext.Provider value={state}>{children}</RpcContext.Provider>
}
