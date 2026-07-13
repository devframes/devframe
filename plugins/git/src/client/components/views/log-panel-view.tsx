'use client'

import type { Commit, CommitDetail } from '../../../index'
import type { GraphRow } from '../../lib/commit-graph'
import type { GitRef } from '../../lib/refs'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeGraph } from '../../lib/commit-graph'
import { parseRefs } from '../../lib/refs'
import { cn } from '../../lib/utils'
import { Avatar } from '../ui/avatar'
import { IconButton } from '../ui/button'
import { Icon } from '../ui/icon'
import { Skeleton } from '../ui/skeleton'

const ROW_H = 48
const COL_W = 18
const NODE_R = 5
const PAD_L = 12
const HOVER_CARD_W = 320
const HOVER_CARD_EST_H = 150

export interface LogPanelViewProps {
  rpcConnected: boolean
  isRepo: boolean | null
  commits: Commit[]
  hasMore: boolean
  loading: boolean
  error: string | null
  /** Optional ref currently used for this log query. */
  selectedRef?: string | null
  /** Active branch name, used to flag the checked-out ref. */
  currentBranch?: string | null
  /** Number of changed working-tree files; drives the "Work In Progress" row. */
  workingChanges?: number | null
  /** Hash of the currently selected commit, highlighted in the list. */
  selectedHash?: string | null
  onRefresh: () => void | Promise<void>
  onLoadMore: () => void | Promise<void>
  /** Called when a commit row is activated. */
  onSelectCommit?: (hash: string) => void
  /**
   * Lazily resolve a commit's detail (author, body, changed-file stats) for the
   * hover card. Omitted in previews or when detail can't be fetched.
   */
  onLoadDetail?: (hash: string) => Promise<CommitDetail>
}

function relativeTime(epoch: number): string {
  const diff = Date.now() - epoch
  const mins = Math.round(diff / 60000)
  if (mins < 1)
    return 'just now'
  if (mins < 60)
    return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30)
    return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(epoch).toLocaleDateString()
}

/** `#rrggbb` → `rgba(...)`, for lane-tinted accents. */
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
        <circle cx={cx(row.col)} cy={mid} r={NODE_R + 4} fill="none" stroke={row.color} strokeWidth={1.5} opacity={0.3} />
      )}
      {/* HEAD reads as a hollow ring ("you are here"); every other commit is a
          solid lane-colored dot. The ring's fill tracks the base surface
          (`bg-base` → white / #111) so it reads as hollow in both themes. */}
      <circle
        cx={cx(row.col)}
        cy={mid}
        r={NODE_R}
        fill={isHead ? undefined : row.color}
        className={isHead ? 'fill-white dark:fill-[#111]' : undefined}
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
        <Icon name="i-ph-tag-duotone" className="size-3 shrink-0" />
        <span className="truncate" title={refToken.name}>{refToken.name}</span>
      </span>
    )
  }

  if (refToken.kind === 'head') {
    return (
      <span className="color-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] leading-none font-medium">
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
        ? <Icon name="i-ph-check" className="size-3 shrink-0" />
        : <Icon name="i-ph-git-branch-duotone" className="size-3 shrink-0 opacity-70" />}
      <span className="truncate" title={name}>{name}</span>
    </span>
  )
}

const CommitRow = memo(({ commit, row, gutter, currentBranch, isHead, topStub, selected, active, onSelect, onHoverEnter, onHoverLeave }: {
  commit: Commit
  row: GraphRow
  gutter: number
  currentBranch?: string | null
  isHead: boolean
  topStub: boolean
  selected: boolean
  active: boolean
  onSelect?: (hash: string) => void
  onHoverEnter: (hash: string, el: HTMLElement) => void
  onHoverLeave: () => void
}) => {
  const refs = useMemo(() => parseRefs(commit.refs, currentBranch), [commit.refs, currentBranch])
  // Commits off the mainline (lane 0) recede, so the checked-out line reads as
  // the spine of the history — matching the emphasized/faded rows in the design.
  const dim = row.col !== 0 && !selected && !active

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(commit.hash)}
        onMouseEnter={e => onHoverEnter(commit.hash, e.currentTarget)}
        onMouseLeave={onHoverLeave}
        onFocus={e => onHoverEnter(commit.hash, e.currentTarget)}
        onBlur={onHoverLeave}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'relative flex w-full items-stretch rounded-lg text-left transition-colors',
          'focus-visible:ring-primary-500/40 outline-none focus-visible:ring-2',
          selected ? 'bg-active' : 'hover:bg-active',
        )}
        style={{ height: ROW_H }}
      >
        <div className="relative z-10">
          <GraphCell row={row} width={gutter} isHead={isHead} topStub={topStub} />
        </div>

        <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 pr-3 pl-2">
          <span
            className={cn(
              'truncate text-[15px] transition-colors',
              dim ? 'color-faint font-normal' : 'color-base font-medium',
            )}
            title={commit.subject}
          >
            {commit.subject}
          </span>
          {refs.map((refToken, i) => (
            <RefLabel key={i} refToken={refToken} color={row.color} />
          ))}
        </div>
      </button>
    </li>
  )
})

function WipRow({ col, color, gutter, changes }: {
  col: number
  color: string
  gutter: number
  changes: number
}) {
  const mid = ROW_H / 2
  return (
    <li className="relative flex items-stretch" style={{ height: ROW_H }}>
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
          <circle cx={cx(col)} cy={mid} r={NODE_R} className="fill-white dark:fill-[#111]" stroke={color} strokeWidth={2} strokeDasharray="2 2" />
        </svg>
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 pr-3 pl-2">
        <Icon name="i-ph-pencil-simple-duotone" className="color-muted size-3.5 shrink-0" />
        <span className="text-[15px] font-medium">Work in Progress</span>
        <span className="color-muted text-xs">
          {changes}
          {' '}
          {changes === 1 ? 'change' : 'changes'}
        </span>
      </div>
    </li>
  )
}

interface DetailState {
  loading: boolean
  data: CommitDetail | null
}

function DiffStat({ additions, deletions }: { additions: number, deletions: number }) {
  return (
    <span className="tabular-nums">
      <span className="text-success font-medium">{`+${additions}`}</span>
      {' '}
      <span className="text-error font-medium">{`−${deletions}`}</span>
    </span>
  )
}

/** The floating commit card shown while hovering a row. */
function CommitHoverCard({ commit, detail, position, onOpen, onMouseEnter, onMouseLeave }: {
  commit: Commit
  detail: DetailState | undefined
  position: { top: number, left: number }
  onOpen: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const body = (detail?.data?.body || commit.body || commit.subject).trim()
  const files = detail?.data?.files.length ?? 0

  return (
    <div
      role="dialog"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="border-base bg-base z-tooltip fixed w-80 overflow-hidden rounded-xl border shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      <div className="space-y-2.5 p-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={commit.author} email={commit.email} className="size-8 text-xs" />
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="color-base truncate font-semibold">{commit.author}</span>
            <span className="color-muted shrink-0 text-xs" title={new Date(commit.date).toLocaleString()}>
              {relativeTime(commit.date)}
            </span>
          </div>
        </div>
        <p className="color-muted line-clamp-3 text-sm leading-snug">{body}</p>
      </div>

      <div className="border-base flex items-center justify-between border-t px-3.5 py-2.5 text-sm">
        {detail?.loading || !detail
          ? (
              <span className="color-faint inline-flex items-center gap-1.5">
                <Icon name="i-ph-spinner-gap" className="size-3.5 animate-spin" />
                Loading…
              </span>
            )
          : detail.data
            ? (
                <span className="color-muted">
                  <span className="color-base font-medium">
                    {files}
                    {' '}
                    {files === 1 ? 'file' : 'files'}
                    {' '}
                    changed
                  </span>
                  {' '}
                  <DiffStat additions={detail.data.totalAdditions} deletions={detail.data.totalDeletions} />
                </span>
              )
            : (
                <code className="color-muted tabular-nums">{commit.shortHash}</code>
              )}

        <IconButton variant="ghost" size="sm" onClick={onOpen} aria-label="Open commit details">
          <Icon name="i-ph-arrow-right" className="size-4" />
        </IconButton>
      </div>
    </div>
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
    selectedRef,
    currentBranch,
    workingChanges,
    selectedHash,
    onRefresh,
    onLoadMore,
    onSelectCommit,
    onLoadDetail,
  } = props

  const graph = useMemo(
    () => computeGraph(commits),
    [commits],
  )
  const gutter = Math.max(graph.columns, 1) * COL_W + COL_W / 2 + PAD_L

  const showWip = (workingChanges ?? 0) > 0
    && commits.length > 0
    && (!selectedRef || selectedRef === currentBranch)
  const headRow = graph.rows[0]

  // Hover card: an anchored floating card that resolves the hovered commit's
  // detail lazily. `hovered` carries the fixed-position anchor; `details`
  // caches per-hash results so re-hovering is instant.
  const [hovered, setHovered] = useState<{ hash: string, top: number, left: number } | null>(null)
  const [details, setDetails] = useState<Record<string, DetailState>>({})
  const showTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const detailsRef = useRef(details)
  detailsRef.current = details
  const onLoadDetailRef = useRef(onLoadDetail)
  onLoadDetailRef.current = onLoadDetail

  const commitByHash = useMemo(() => {
    const map = new Map<string, Commit>()
    for (const c of commits)
      map.set(c.hash, c)
    return map
  }, [commits])

  const loadDetail = useCallback((hash: string) => {
    if (!onLoadDetailRef.current || detailsRef.current[hash])
      return
    setDetails(prev => ({ ...prev, [hash]: { loading: true, data: null } }))
    onLoadDetailRef.current(hash)
      .then(data => setDetails(prev => ({ ...prev, [hash]: { loading: false, data } })))
      .catch(() => setDetails(prev => ({ ...prev, [hash]: { loading: false, data: null } })))
  }, [])

  const onHoverEnter = useCallback((hash: string, el: HTMLElement) => {
    clearTimeout(hideTimer.current)
    clearTimeout(showTimer.current)
    showTimer.current = setTimeout(() => {
      const rect = el.getBoundingClientRect()
      let left = rect.left + Math.min(gutter, 64) + 8
      left = Math.min(left, window.innerWidth - HOVER_CARD_W - 12)
      left = Math.max(12, left)
      let top = rect.bottom + 4
      if (top + HOVER_CARD_EST_H > window.innerHeight)
        top = Math.max(12, rect.top - HOVER_CARD_EST_H - 4)
      setHovered({ hash, top, left })
      loadDetail(hash)
    }, 220)
  }, [gutter, loadDetail])

  const scheduleHide = useCallback(() => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(setHovered, 160, null)
  }, [])

  const cancelHide = useCallback(() => {
    clearTimeout(hideTimer.current)
  }, [])

  useEffect(() => () => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
  }, [])

  // Auto-load the next page when the bottom sentinel scrolls into view, instead
  // of a manual "Load more" button. `busyRef` debounces the observer so one
  // page is requested per visibility change.
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  useEffect(() => {
    if (!loading)
      busyRef.current = false
  }, [loading])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore)
      return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !busyRef.current && !loading) {
          busyRef.current = true
          void onLoadMoreRef.current()
        }
      },
      { root, rootMargin: '120px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, commits.length])

  const hoveredCommit = hovered ? commitByHash.get(hovered.hash) : undefined

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="text-lg leading-none font-semibold tracking-tight">Commit History</h2>
          <span className="color-muted shrink-0 text-xs tabular-nums">
            {isRepo
              ? `${commits.length}${hasMore ? '+' : ''}${selectedRef ? ` · ${selectedRef}` : ''}`
              : ''}
          </span>
        </div>
        <IconButton variant="ghost" size="sm" onClick={onRefresh} disabled={loading} aria-label="Refresh log">
          <Icon name="i-ph-arrows-clockwise" className={cn('size-4', loading && 'animate-spin')} />
        </IconButton>
      </div>

      {!rpcConnected && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {error && (
        <p className="text-error text-sm">{error}</p>
      )}

      {isRepo === false && (
        <p className="color-muted text-sm">The working directory is not a git repository.</p>
      )}

      {isRepo === true && commits.length === 0 && (
        <p className="color-muted text-sm">No commits yet.</p>
      )}

      {isRepo === true && commits.length > 0 && (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-2" onScroll={scheduleHide}>
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
                selected={commit.hash === selectedHash}
                active={commit.hash === hovered?.hash}
                onSelect={onSelectCommit}
                onHoverEnter={onHoverEnter}
                onHoverLeave={scheduleHide}
              />
            ))}
          </ul>

          {hasMore && (
            <div ref={sentinelRef} className="color-muted flex items-center justify-center gap-2 py-3 text-xs">
              <Icon name="i-ph-spinner-gap" className="size-3.5 animate-spin" />
              Loading more…
            </div>
          )}
        </div>
      )}

      {hovered && hoveredCommit && (
        <CommitHoverCard
          commit={hoveredCommit}
          detail={details[hovered.hash]}
          position={{ top: hovered.top, left: hovered.left }}
          onOpen={() => {
            onSelectCommit?.(hovered.hash)
            setHovered(null)
          }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        />
      )}
    </div>
  )
}
