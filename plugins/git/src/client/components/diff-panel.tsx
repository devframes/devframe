'use client'

import type { DevframeRpcClient } from 'devframe/client'
import { useCallback, useState } from 'react'
import { useRpcResource } from './use-rpc-resource'
import { DiffPanelView, DiffPatchView } from './views/diff-panel-view'

function PatchViewer({ staged, path }: { staged: boolean, path: string }) {
  const loader = useCallback(
    (rpc: DevframeRpcClient) => rpc.call('git:diff', { staged, path }),
    [staged, path],
  )
  const { data, loading } = useRpcResource(loader)
  return (
    <DiffPatchView
      patch={data?.patch ?? null}
      loading={loading || !data}
      truncated={data?.truncated ?? false}
    />
  )
}

export function DiffPanel() {
  const [staged, setStaged] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const loader = useCallback(
    (rpc: DevframeRpcClient) => rpc.call('git:diff', { staged }),
    [staged],
  )
  const { data, loading, refresh } = useRpcResource(loader)

  const selectScope = useCallback((value: boolean) => {
    setStaged(value)
    setSelected(null)
  }, [])

  return (
    <DiffPanelView
      data={data}
      loading={loading}
      staged={staged}
      selected={selected}
      onSelectScope={selectScope}
      onSelectFile={setSelected}
      onRefresh={refresh}
      patchSlot={selected ? <PatchViewer key={`${staged}:${selected}`} staged={staged} path={selected} /> : null}
    />
  )
}
