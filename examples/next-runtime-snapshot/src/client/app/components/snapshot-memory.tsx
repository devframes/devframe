'use client'

import type { MemorySnapshot } from '../../../devframe'
import { useCallback, useEffect, useState } from 'react'
import { button, card } from '../design'
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
  const { ctx } = useRpc()
  const [snap, setSnap] = useState<MemorySnapshot | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!ctx)
      return
    setLoading(true)
    try {
      const r = await ctx.rpc.call('memory')
      setSnap(r)
    }
    finally {
      setLoading(false)
    }
  }, [ctx])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <section className={card('p-4')}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="i-ph-gauge-duotone color-active" />
        <span>Memory & Uptime</span>
        <span className="flex-1" />
        <button
          type="button"
          className={button({ variant: 'outline', size: 'sm' })}
          onClick={refresh}
          disabled={!ctx || loading}
        >
          <span className={loading ? 'i-ph-arrows-clockwise animate-spin' : 'i-ph-arrows-clockwise'} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </h2>
      {snap
        ? (
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <span className="color-muted">uptime</span>
              <span className="font-mono tabular-nums">{fmtUptime(snap.uptimeSeconds)}</span>
              <span className="color-muted">rss</span>
              <span className="font-mono tabular-nums">{fmtBytes(snap.memory.rss)}</span>
              <span className="color-muted">heap used</span>
              <span className="font-mono tabular-nums">{fmtBytes(snap.memory.heapUsed)}</span>
              <span className="color-muted">heap total</span>
              <span className="font-mono tabular-nums">{fmtBytes(snap.memory.heapTotal)}</span>
              <span className="color-muted">external</span>
              <span className="font-mono tabular-nums">{fmtBytes(snap.memory.external)}</span>
              <span className="color-muted">array buffers</span>
              <span className="font-mono tabular-nums">{fmtBytes(snap.memory.arrayBuffers)}</span>
            </div>
          )
        : <p className="text-sm color-muted">Loading…</p>}
    </section>
  )
}
