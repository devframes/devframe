'use client'

import type { EnvSnapshot } from '../../../devframe'
import { useCallback, useEffect, useState } from 'react'
import { card, input as inputClass } from '../design'
import { useRpc } from './connect'

export function SnapshotEnv() {
  const { ctx } = useRpc()
  const [pattern, setPattern] = useState('NODE')
  const [snap, setSnap] = useState<EnvSnapshot | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchEnv = useCallback(async (p: string) => {
    if (!ctx)
      return
    setLoading(true)
    try {
      const r = await ctx.rpc.call('env', { pattern: p })
      setSnap(r)
    }
    finally {
      setLoading(false)
    }
  }, [ctx])

  useEffect(() => {
    const t = setTimeout(() => void fetchEnv(pattern), 200)
    return () => clearTimeout(t)
  }, [pattern, fetchEnv])

  return (
    <section className={card('p-4 md:col-span-2')}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="i-ph-list-bullets-duotone color-active" />
        <span>Environment</span>
        <span className="flex-1" />
        {snap && (
          <span className="text-xs color-muted tabular-nums">
            {snap.entries.length}
            {' / '}
            {snap.total}
          </span>
        )}
      </h2>
      <input
        type="text"
        className={inputClass('mb-3')}
        value={pattern}
        onChange={e => setPattern(e.target.value)}
        placeholder="Regex filter (case-insensitive) — e.g. NODE | PATH | HOME"
        aria-label="Environment variable filter (case-insensitive regex)"
      />
      {snap === null && <p className="text-sm color-muted">Loading…</p>}
      {snap && snap.entries.length === 0 && (
        <p className="text-sm color-muted">
          {loading ? 'Searching…' : 'No environment variables match this pattern.'}
        </p>
      )}
      {snap && snap.entries.length > 0 && (
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
          {snap.entries.map(entry => (
            <div
              key={entry.key}
              className="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-3 border-b border-base py-1 last:border-b-0"
            >
              <span className="truncate font-mono color-muted">{entry.key}</span>
              <span className={`break-all font-mono ${entry.redacted ? 'color-muted italic' : 'color-base'}`}>{entry.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
