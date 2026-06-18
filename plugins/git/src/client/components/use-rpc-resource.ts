'use client'

import type { DevframeRpcClient } from 'devframe/client'
import { useCallback, useEffect, useState } from 'react'
import { useRpc } from './rpc-provider'

export interface RpcResource<T> {
  data: T | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Load a value from an RPC call, exposing `{ data, loading, error, refresh }`.
 * `loader` must be stable — wrap it in `useCallback` at the call site so the
 * effect re-runs only when its real inputs change.
 */
export function useRpcResource<T>(loader: (rpc: DevframeRpcClient) => Promise<T>): RpcResource<T> {
  const { rpc } = useRpc()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!rpc)
      return
    setLoading(true)
    setError(null)
    try {
      setData(await loader(rpc))
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    finally {
      setLoading(false)
    }
  }, [rpc, loader])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
