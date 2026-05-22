'use client'

import type { MemorySnapshot } from '../../../devframe'
import { useCallback, useEffect, useState } from 'react'
import { useRpc } from './connect'

function fmtBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

function fmtUptime(seconds: number): string {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rem = s % 60
  if (h > 0)
    return `${h}h ${m}m ${rem}s`
  if (m > 0)
    return `${m}m ${rem}s`
  return `${rem}s`
}

export function SnapshotMemory() {
  const { rpc } = useRpc()
  const [snap, setSnap] = useState<MemorySnapshot | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!rpc)
      return
    setLoading(true)
    try {
      const r = await rpc.call('next-runtime-snapshot:memory' as any) as MemorySnapshot
      setSnap(r)
    }
    finally {
      setLoading(false)
    }
  }, [rpc])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <section className="card">
      <h2>
        <span>Memory & Uptime</span>
        <span className="actions">
          <button type="button" onClick={refresh} disabled={!rpc || loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </span>
      </h2>
      {snap
        ? (
            <div className="kv">
              <span className="k">uptime</span>
              <span className="v">{fmtUptime(snap.uptimeSeconds)}</span>
              <span className="k">rss</span>
              <span className="v">{fmtBytes(snap.memory.rss)}</span>
              <span className="k">heap used</span>
              <span className="v">{fmtBytes(snap.memory.heapUsed)}</span>
              <span className="k">heap total</span>
              <span className="v">{fmtBytes(snap.memory.heapTotal)}</span>
              <span className="k">external</span>
              <span className="v">{fmtBytes(snap.memory.external)}</span>
              <span className="k">array buffers</span>
              <span className="v">{fmtBytes(snap.memory.arrayBuffers)}</span>
            </div>
          )
        : <p className="loading">Loading…</p>}
    </section>
  )
}
