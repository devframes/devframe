'use client'

import type { DevframeScopedClientContext } from 'devframe/client'
import type { ReactNode } from 'react'
import { RpcProvider as DevframeRpcProvider, useRpc as useDevframeRpc, useRpcStatus } from '@devframes/next/client'
import { useMemo } from 'react'

// Inlined (not imported from the server `rpc/index.ts`) so the client
// bundle stays free of node-only server code.
const NAMESPACE = 'example:next-runtime-snapshot'

export type SnapshotCtx = DevframeScopedClientContext<typeof NAMESPACE>

interface ConnectionState {
  ctx: SnapshotCtx | null
  error: string | null
}

/**
 * Connect to the RPC backend via `@devframes/next/client` — the connect +
 * status machinery lives in the package now; this file only scopes the client
 * to this tool's namespace and reshapes the status for the local UI.
 */
export function RpcProvider({ children }: { children: ReactNode }) {
  return <DevframeRpcProvider>{children}</DevframeRpcProvider>
}

export function useRpc(): ConnectionState {
  const rpc = useDevframeRpc()
  const { error } = useRpcStatus()
  // `rpc` is stable once resolved, so memoizing on it keeps `ctx` referentially
  // stable across renders (the snapshot components depend on `ctx` identity).
  const ctx = useMemo(() => (rpc ? rpc.scope(NAMESPACE) : null), [rpc])
  return { ctx, error: error ? error.message : null }
}
