'use client'

import type { SystemInfo } from '../../../devframe'
import { useEffect, useState } from 'react'
import { card } from '../design'
import { useRpc } from './connect'

function formatStartedAt(epoch: number): string {
  return new Date(epoch).toLocaleString()
}

export function SnapshotSystem() {
  const { ctx } = useRpc()
  const [info, setInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    if (!ctx)
      return
    let active = true
    ctx.rpc.call('system').then((r) => {
      if (active)
        setInfo(r)
    })
    return () => {
      active = false
    }
  }, [ctx])

  return (
    <section className={card('p-4')}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="i-ph-cpu-duotone color-active" />
        System
      </h2>
      {info
        ? (
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <span className="color-muted">node</span>
              <span className="font-mono break-all">{info.node}</span>
              <span className="color-muted">platform</span>
              <span className="font-mono break-all">{`${info.platform} (${info.arch})`}</span>
              <span className="color-muted">pid</span>
              <span className="font-mono break-all tabular-nums">{info.pid}</span>
              <span className="color-muted">cwd</span>
              <span className="font-mono break-all">{info.cwd}</span>
              <span className="color-muted">started</span>
              <span className="font-mono break-all">{formatStartedAt(info.startedAt)}</span>
            </div>
          )
        : <p className="text-sm color-muted">Loading…</p>}
    </section>
  )
}
