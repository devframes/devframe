'use client'

import type { Commit } from '../../../index'
import type { GraphRow } from '../../lib/commit-graph'
import type { GitRef } from '../../lib/refs'
import { Check, GitBranch, Pencil, RefreshCw, Tag } from 'lucide-react'
import { useMemo } from 'react'
import { computeGraph } from '../../lib/commit-graph'
import { parseRefs } from '../../lib/refs'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'

const ROW_H = 46
const COL_W = 16
const NODE_R = 5
const PAD_L = 6
// Width reserved on the left for branch / tag labels, right-aligned against
// the graph so the active branch hugs its node.
const REFS_W = 152

export interface LogPanelViewProps {
  rpcConnected: boolean
  isRepo: boolean | null
  commits: Commit[]
  hasMore: boolean
  loading: boolean
  error: string | null
  liveBackend: boolean
  /** Active branch name, used to flag the checked-out ref. */
  currentBranch?: string | null
  /** Number of changed working-tree files; drives the "Work In Progress" row. */
  workingChanges?: number | null
  onRefresh: () => void | Promise<void>
  onLoadMore: () => void | Promise<void>
}

function relativeTime(epoch: number): string {
  const diff = Date.now() - epoch
  const mins = Math.round(diff / 60000)
  if (mins < 1)
    return 'just now'
  if (mins < 60)
    return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24)
    return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30)
    return `${days}d ago`
  return new Date(epoch).toLocaleDateString()
}

/** `#rrggbb` → `rgba(...)`, for lane-tinted backgrounds. */
function withAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function cx(col: number): number {
  return PAD_L + col * COL_W + COL_W / 2
}

function linkPath(fromCol: number, fromY: number, toCol: number, toY: number): string {
  const x1 = cx(fromCol)
  const x2 = cx(toCol)
  if (fromCol === toCol)
    return `M ${x1} ${fromY} L ${x2} ${toY}`
  const midY = (fromY + toY) / 2
  return `M ${x1} ${fromY} C ${x1} ${midY} ${x2} ${midY} ${x2} ${toY}`
}

function GraphCell({ row, width, isHead, topStub }: {
  row: GraphRow
  width: number
  isHead: boolean
  topStub: boolean
}) {
  const mid = ROW_H / 2
  return (
    <svg width={width} height={ROW_H} className="block shrink-0" style={{ overflow: 'visible' }} aria-hidden>
      {topStub && (
        <path d={linkPath(row.col, 0, row.col, mid)} fill="none" stroke={row.color} strokeWidth={2} strokeLinecap="round" />
      )}
      {row.topLinks.map((link, i) => (
        <path
          key={`t${i}`}
          d={linkPath(link.from, 0, link.to, mid)}
          fill="none"
          stroke={link.color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {row.bottomLinks.map((link, i) => (
        <path
          key={`b${i}`}
          d={linkPath(link.from, mid, link.to, ROW_H)}
          fill="none"
          stroke={link.color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {isHead && (
        <circle cx={cx(row.col)} cy={mid} r={NODE_R + 3.5} fill="none" stroke={row.color} strokeWidth={1.5} opacity={0.4} />
      )}
      <circle
        cx={cx(row.col)}
        cy={mid}
        r={NODE_R}
        fill={isHead ? row.color : 'var(--color-card)'}
        stroke={row.color}
        strokeWidth={2.5}
      />
    </svg>
  )
}

function RefLabel({ refToken, color }: { refToken: GitRef, color: string }) {
  if (refToken.kind === 'tag') {
    return (
      <span
        className="inline-flex max-w-[140px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none font-medium"
        style={{ color, borderColor: withAlpha(color, 0.5), backgroundColor: withAlpha(color, 0.12) }}
      >
        <Tag className="size-3 shrink-0" />
        <span className="truncate">{refToken.name}</span>
      </span>
    )
  }

  if (refToken.kind === 'head') {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] leading-none font-medium">
        HEAD
      </span>
    )
  }

  const name = refToken.kind === 'remote' ? `${refToken.remote}/${refToken.name}` : refToken.name
  const current = refToken.kind === 'branch' && refToken.current

  return (
    <span
      className="inline-flex max-w-[140px] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-none font-medium"
      style={
        current
          ? { color: '#fff', backgroundColor: color }
          : { color, borderColor: withAlpha(color, 0.5), backgroundColor: withAlpha(color, 0.12), borderWidth: 1, borderStyle: 'solid' }
      }
    >
      {current
        ? <Check className="size-3 shrink-0" />
        : <GitBranch className="size-3 shrink-0 opacity-70" />}
      <span className="truncate">{name}</span>
    </span>
  )
}

function CommitRow({ commit, row, gutter, currentBranch, isHead, topStub }: {
  commit: Commit
  row: GraphRow
  gutter: number
  currentBranch?: string | null
  isHead: boolean
  topStub: boolean
}) {
  const refs = useMemo(() => parseRefs(commit.refs, currentBranch), [commit.refs, currentBranch])
  const hasCurrent = refs.some(r => r.kind === 'branch' && r.current)

  return (
    <li className="relative flex items-stretch" style={{ height: ROW_H }}>
      {/* Lane-tinted row highlight, fading toward the message. */}
      <div
        className="pointer-events-none absolute inset-y-[5px] left-0 rounded-full"
        style={{
          width: REFS_W + gutter + 12,
          background: `linear-gradient(90deg, ${withAlpha(row.color, hasCurrent ? 0.34 : 0.2)} 0%, ${withAlpha(row.color, 0.04)} 100%)`,
        }}
      />

      <div className="relative z-10 flex items-center justify-end gap-1 overflow-hidden pr-1.5" style={{ width: REFS_W }}>
        {refs.map((refToken, i) => (
          <RefLabel key={i} refToken={refToken} color={row.color} />
        ))}
      </div>

      <div className="relative z-10">
        <GraphCell row={row} width={gutter} isHead={isHead} topStub={topStub} />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-0.5 pl-4">
        <span className="truncate text-sm font-medium">{commit.subject}</span>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <code className="shrink-0">{commit.shortHash}</code>
          <span className="truncate">{commit.author}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0" title={new Date(commit.date).toLocaleString()}>{relativeTime(commit.date)}</span>
        </div>
      </div>
    </li>
  )
}

function WipRow({ col, color, gutter, changes }: {
  col: number
  color: string
  gutter: number
  changes: number
}) {
  const mid = ROW_H / 2
  return (
    <li className="relative flex items-stretch" style={{ height: ROW_H }}>
      <div
        className="pointer-events-none absolute inset-y-[5px] left-0 rounded-full"
        style={{ width: REFS_W + gutter + 12, background: `linear-gradient(90deg, ${withAlpha(color, 0.16)} 0%, ${withAlpha(color, 0.03)} 100%)` }}
      />
      <div className="relative z-10" style={{ width: REFS_W }} />
      <div className="relative z-10">
        <svg width={gutter} height={ROW_H} className="block shrink-0" style={{ overflow: 'visible' }} aria-hidden>
          <path
            d={linkPath(col, mid, col, ROW_H)}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeDasharray="2 3"
            strokeLinecap="round"
          />
          <circle cx={cx(col)} cy={mid} r={NODE_R} fill="var(--color-card)" stroke={color} strokeWidth={2} strokeDasharray="2 2" />
        </svg>
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 pl-4">
        <Pencil className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-sm font-medium">Work in Progress</span>
        <span className="text-muted-foreground text-xs">
          {changes}
          {' '}
          {changes === 1 ? 'change' : 'changes'}
        </span>
      </div>
    </li>
  )
}

export function LogPanelView(props: LogPanelViewProps) {
  const {
    rpcConnected,
    isRepo,
    commits,
    hasMore,
    loading,
    error,
    liveBackend,
    currentBranch,
    workingChanges,
    onRefresh,
    onLoadMore,
  } = props

  const graph = useMemo(
    () => computeGraph(commits),
    [commits],
  )
  const gutter = Math.max(graph.columns, 1) * COL_W + COL_W / 2 + PAD_L

  const showWip = (workingChanges ?? 0) > 0 && commits.length > 0
  const headRow = graph.rows[0]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {isRepo ? `${commits.length} commits` : ' '}
        </span>
        <Button variant="ghost" size="icon" className="size-7" onClick={onRefresh} disabled={loading} aria-label="Refresh log">
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {!rpcConnected && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {error && (
        <p className="text-destructive text-sm">{error}</p>
      )}

      {isRepo === false && (
        <p className="text-muted-foreground text-sm">The working directory is not a git repository.</p>
      )}

      {isRepo === true && commits.length === 0 && (
        <p className="text-muted-foreground text-sm">No commits yet.</p>
      )}

      {isRepo === true && commits.length > 0 && (
        <ScrollArea className="h-80 pr-3">
          <ul>
            {showWip && headRow && (
              <WipRow col={headRow.col} color={headRow.color} gutter={gutter} changes={workingChanges ?? 0} />
            )}
            {commits.map((commit, i) => (
              <CommitRow
                key={commit.hash}
                commit={commit}
                row={graph.rows[i]}
                gutter={gutter}
                currentBranch={currentBranch}
                isHead={i === 0}
                topStub={i === 0 && showWip}
              />
            ))}
          </ul>
        </ScrollArea>
      )}

      {isRepo === true && hasMore && (
        <Button variant="outline" size="sm" className="w-full" onClick={onLoadMore} disabled={loading || !liveBackend}>
          Load more
        </Button>
      )}

      {isRepo === true && hasMore && !liveBackend && (
        <p className="text-muted-foreground text-xs">Load more is available in live mode.</p>
      )}
    </div>
  )
}
