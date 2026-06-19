'use client'

import type { DevframeRpcClient } from 'devframe/client'
import { useCallback } from 'react'
import { useRpcResource } from './use-rpc-resource'
import { BranchesPanelView } from './views/branches-panel-view'

export function BranchesPanel() {
  const loader = useCallback((rpc: DevframeRpcClient) => rpc.call('git:branches'), [])
  const { data, loading, refresh } = useRpcResource(loader)

  return <BranchesPanelView data={data} loading={loading} onRefresh={refresh} />
}
