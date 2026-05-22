'use client'

import type { EnvSnapshot } from '../../../devframe'
import { useCallback, useEffect, useState } from 'react'
import { useRpc } from './connect'

export function SnapshotEnv() {
  const { rpc } = useRpc()
  const [pattern, setPattern] = useState('NODE')
  const [snap, setSnap] = useState<EnvSnapshot | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchEnv = useCallback(async (p: string) => {
    if (!rpc)
      return
    setLoading(true)
    try {
      const r = await rpc.call('next-runtime-snapshot:env', { pattern: p })
      setSnap(r)
    }
    finally {
      setLoading(false)
    }
  }, [rpc])

  useEffect(() => {
    const t = setTimeout(() => void fetchEnv(pattern), 200)
    return () => clearTimeout(t)
  }, [pattern, fetchEnv])

  return (
    <section className="card">
      <h2>
        <span>Environment</span>
        {snap && (
          <span className="actions">
            <span style={{ fontSize: 12, color: '#8b95a3' }}>
              {snap.entries.length}
              {' / '}
              {snap.total}
            </span>
          </span>
        )}
      </h2>
      <div className="env-filter">
        <input
          type="text"
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          placeholder="Regex filter (case-insensitive) — e.g. NODE | PATH | HOME"
          aria-label="Environment variable filter (case-insensitive regex)"
        />
      </div>
      {snap === null && <p className="loading">Loading…</p>}
      {snap && snap.entries.length === 0 && (
        <p className="empty">
          {loading ? 'Searching…' : 'No environment variables match this pattern.'}
        </p>
      )}
      {snap && snap.entries.length > 0 && (
        <div className="env-list">
          {snap.entries.map(entry => (
            <div
              key={entry.key}
              className={entry.redacted ? 'env-row redacted' : 'env-row'}
            >
              <span className="k">{entry.key}</span>
              <span className="v">{entry.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
