'use client'

import type { Commit } from '../../../index'
import type { GraphRow } from '../../lib/commit-graph'
import { RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { computeGraph } from '../../lib/commit-graph'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'

const ROW_H = 42
const COL_W = 12
const NODE_R = 4

export interface LogPanelViewProps {
  rpcConnected: boolean
  isRepo: boolean | null
  commits: Commit[]
  hasMore: boolean
  loading: boolean
  error: string | null
  liveBackend: boolean
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

function cx(col: number): number {
  return col * COL_W + COL_W / 2
}

function linkPath(fromCol: number, fromY: number, toCol: number, toY: number): string {
  const x1 = cx(fromCol)
  const x2 = cx(toCol)
  if (fromCol === toCol)
    return `M ${x1} ${fromY} L ${x2} ${toY}`
  const midY = (fromY + toY) / 2
  return `M ${x1} ${fromY} C ${x1} ${midY} ${x2} ${midY} ${x2} ${toY}`
}

function GraphCell({ row, width }: { row: GraphRow, width: number }) {
  const mid = ROW_H / 2
  return (
    <svg width={width} height={ROW_H} className="block shrink-0" style={{ overflow: 'visible' }} aria-hidden>
      {row.topLinks.map((link, i) => (
        <path
          key={`t${i}`}
          d={linkPath(link.from, 0, link.to, mid)}
          fill="none"
          stroke={link.color}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      ))}
      {row.bottomLinks.map((link, i) => (
        <path
          key={`b${i}`}
          d={linkPath(link.from, mid, link.to, ROW_H)}
          fill="none"
          stroke={link.color}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      ))}
      <circle cx={cx(row.col)} cy={mid} r={NODE_R} fill={row.color} stroke="var(--color-card)" strokeWidth={2} />
    </svg>
  )
}

function CommitRow({ commit, row, gutter }: { commit: Commit, row: GraphRow, gutter: number }) {
  return (
    <li className="flex items-stretch" style={{ height: ROW_H }}>
      <GraphCell row={row} width={gutter} />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pl-2">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{commit.subject}</span>
          {commit.refs.map(ref => (
            <Badge key={ref} variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px]">{ref}</Badge>
          ))}
        </div>
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

export function LogPanelView(props: LogPanelViewProps) {
  const {
    rpcConnected,
    isRepo,
    commits,
    hasMore,
    loading,
    error,
    liveBackend,
    onRefresh,
    onLoadMore,
  } = props

  const graph = useMemo(
    () => computeGraph(commits),
    [commits],
  )
  const gutter = Math.max(graph.columns, 1) * COL_W + COL_W / 2

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {isRepo ? `${commits.length} commits` : ' '}
        </span>
        <Button variant="ghost" size="icon" className="size-7" onClick={onRefresh} disabled={loading} aria-label="Refresh log">
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
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
            {commits.map((commit, i) => (
              <CommitRow key={commit.hash} commit={commit} row={graph.rows[i]} gutter={gutter} />
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
