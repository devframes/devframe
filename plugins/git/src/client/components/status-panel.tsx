'use client'

import type { DevframeRpcClient } from 'devframe/client'
import { useCallback, useState } from 'react'
import { useRpc } from './rpc-provider'
import { useRpcResource } from './use-rpc-resource'
import { DiffPatchView } from './views/diff-panel-view'
import { StatusPanelView } from './views/status-panel-view'

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

/**
 * The merged "Changes" view: the working tree's staged / unstaged / untracked
 * files (with stage / unstage / commit actions in write mode), and — when a
 * file is selected — its diff below, folding the old Status and Diff tabs into
 * one surface.
 */
export function StatusPanel() {
  const { rpc } = useRpc()
  const loader = useCallback((r: DevframeRpcClient) => r.call('git:status'), [])
  const { data, loading, refresh, setData } = useRpcResource(loader)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ path: string, staged: boolean } | null>(null)

  const canWrite = !!data?.canWrite && rpc?.connectionMeta.backend === 'websocket'

  const stage = useCallback(async (paths: string[]) => {
    if (!rpc || paths.length === 0)
      return
    setBusy(true)
    setNote(null)
    try {
      setData(await rpc.call('git:stage', { paths }))
    }
    finally {
      setBusy(false)
    }
  }, [rpc, setData])

  const unstage = useCallback(async (paths: string[]) => {
    if (!rpc || paths.length === 0)
      return
    setBusy(true)
    setNote(null)
    try {
      setData(await rpc.call('git:unstage', { paths }))
    }
    finally {
      setBusy(false)
    }
  }, [rpc, setData])

  const commit = useCallback(async () => {
    if (!rpc)
      return
    setBusy(true)
    setNote(null)
    try {
      const result = await rpc.call('git:commit', { message })
      setData(result.status)
      if (result.ok)
        setMessage('')
      else
        setNote(result.message)
    }
    finally {
      setBusy(false)
    }
  }, [rpc, message, setData])

  const selectFile = useCallback((path: string, staged: boolean) => {
    setSelected(prev => (prev && prev.path === path && prev.staged === staged ? null : { path, staged }))
  }, [])

  return (
    <StatusPanelView
      data={data}
      loading={loading}
      busy={busy}
      canWrite={!!canWrite}
      message={message}
      note={note}
      selectedKey={selected ? `${selected.staged}:${selected.path}` : null}
      onRefresh={refresh}
      onStage={stage}
      onUnstage={unstage}
      onCommit={commit}
      onMessageChange={setMessage}
      onSelectFile={selectFile}
      patchSlot={selected
        ? <PatchViewer key={`${selected.staged}:${selected.path}`} staged={selected.staged} path={selected.path} />
        : null}
    />
  )
}
