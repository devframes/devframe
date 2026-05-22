'use client'

import type { SystemInfo } from '../../../devframe'
import { useEffect, useState } from 'react'
import { useRpc } from './connect'

function formatStartedAt(epoch: number): string {
  return new Date(epoch).toLocaleString()
}

export function SnapshotSystem() {
  const { rpc } = useRpc()
  const [info, setInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    if (!rpc)
      return
    let active = true
    rpc.call('next-runtime-snapshot:system').then((r) => {
      if (active)
        setInfo(r)
    })
    return () => {
      active = false
    }
  }, [rpc])

  return (
    <section className="card">
      <h2>System</h2>
      {info
        ? (
            <div className="kv">
              <span className="k">node</span>
              <span className="v">{info.node}</span>
              <span className="k">platform</span>
              <span className="v">{`${info.platform} (${info.arch})`}</span>
              <span className="k">pid</span>
              <span className="v">{info.pid}</span>
              <span className="k">cwd</span>
              <span className="v">{info.cwd}</span>
              <span className="k">started</span>
              <span className="v">{formatStartedAt(info.startedAt)}</span>
            </div>
          )
        : <p className="loading">Loading…</p>}
    </section>
  )
}
