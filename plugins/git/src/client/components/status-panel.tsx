'use client'

import type { DevframeRpcClient } from 'devframe/client'
import { useCallback, useState } from 'react'
import { useRpc } from './rpc-provider'
import { useRpcResource } from './use-rpc-resource'
import { StatusPanelView } from './views/status-panel-view'

export function StatusPanel() {
  const { rpc } = useRpc()
  const loader = useCallback((r: DevframeRpcClient) => r.call('git:status'), [])
  const { data, loading, refresh, setData } = useRpcResource(loader)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [note, setNote] = useState<string | null>(null)

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

  return (
    <StatusPanelView
      data={data}
      loading={loading}
      busy={busy}
      canWrite={!!canWrite}
      message={message}
      note={note}
      onRefresh={refresh}
      onStage={stage}
      onUnstage={unstage}
      onCommit={commit}
      onMessageChange={setMessage}
    />
  )
}
