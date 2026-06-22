'use client'

import type { DevframeRpcClient } from 'devframe/client'
import type { Commit } from '../../index'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRpc } from './rpc-provider'
import { LogPanelView } from './views/log-panel-view'

const PAGE = 30

export function LogPanel() {
  const { rpc } = useRpc()
  const [isRepo, setIsRepo] = useState<boolean | null>(null)
  const [commits, setCommits] = useState<Commit[]>([])
  const [skip, setSkip] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [workingChanges, setWorkingChanges] = useState<number | null>(null)
  const commitsRef = useRef<Commit[]>([])

  useEffect(() => {
    commitsRef.current = commits
  }, [commits])

  const loadPage = useCallback(async (
    client: DevframeRpcClient,
    nextSkip: number,
    mode: 'replace' | 'append',
  ) => {
    setLoading(true)
    setError(null)
    try {
      const page = await client.call('git:log', { limit: PAGE, skip: nextSkip })
      setIsRepo(page.isRepo)
      if (mode === 'replace') {
        setCommits(page.commits)
        setSkip(page.commits.length)
      }
      else {
        const seen = new Set(commitsRef.current.map(c => c.hash))
        const unique = page.commits.filter((c) => {
          if (seen.has(c.hash))
            return false
          seen.add(c.hash)
          return true
        })
        if (unique.length === 0) {
          // Static fallback snapshots can return the same page for any args.
          setHasMore(false)
          return
        }
        setCommits(prev => [...prev, ...unique])
        setSkip(prev => prev + unique.length)
      }
      setHasMore(page.hasMore)
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    finally {
      setLoading(false)
    }
  }, [])

  const loadStatus = useCallback(async (client: DevframeRpcClient) => {
    try {
      const status = await client.call('git:status')
      setCurrentBranch(status.branch)
      setWorkingChanges(
        status.staged.length + status.unstaged.length + status.untracked.length,
      )
    }
    catch {
      // Status is decorative here (current-branch flag + WIP row); the log
      // itself drives the panel, so a status failure stays silent.
    }
  }, [])

  useEffect(() => {
    if (!rpc)
      return
    void loadPage(rpc, 0, 'replace')
    void loadStatus(rpc)
  }, [rpc, loadPage, loadStatus])

  const refresh = useCallback(async () => {
    if (!rpc)
      return
    await Promise.all([loadPage(rpc, 0, 'replace'), loadStatus(rpc)])
  }, [rpc, loadPage, loadStatus])

  const loadMore = useCallback(async () => {
    if (!rpc)
      return
    await loadPage(rpc, skip, 'append')
  }, [rpc, skip, loadPage])

  const liveBackend = rpc?.connectionMeta.backend === 'websocket'

  return (
    <LogPanelView
      rpcConnected={!!rpc}
      isRepo={isRepo}
      commits={commits}
      hasMore={hasMore}
      loading={loading}
      error={error}
      liveBackend={!!liveBackend}
      currentBranch={currentBranch}
      workingChanges={workingChanges}
      onRefresh={refresh}
      onLoadMore={loadMore}
    />
  )
}
