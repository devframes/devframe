'use client'

import type { DevframeRpcClient } from 'devframe/client'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Branch, GitBranches } from '../../index'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import { CommitDetailsPanel } from './commit-details-panel'
import { DiffPanel } from './diff-panel'
import { LogPanel } from './log-panel'
import { RpcProvider, useRpc } from './rpc-provider'
import { StatusPanel } from './status-panel'
import { useTheme } from './theme'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Icon } from './ui/icon'
import { Skeleton } from './ui/skeleton'
import { useRpcResource } from './use-rpc-resource'

type DashboardPane = 'status' | 'commits' | 'diff'

interface NavItem {
  id: DashboardPane
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'status', label: 'Status', icon: 'i-ph-tree-view-duotone' },
  { id: 'commits', label: 'Commits', icon: 'i-ph-git-commit-duotone' },
  { id: 'diff', label: 'Diff', icon: 'i-ph-git-diff-duotone' },
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * A draggable rail width, persisted to localStorage. `dir` is +1 for a
 * left-edge rail (drag right widens) and -1 for a right-edge rail (drag left
 * widens), matching the resizer's position relative to the panel it sizes.
 */
function useRailWidth(key: string, initial: number, min: number, max: number, dir: 1 | -1) {
  const [width, setWidth] = useState(initial)
  const widthRef = useRef(initial)
  widthRef.current = width

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key))
      if (Number.isFinite(saved) && saved > 0)
        setWidth(clamp(saved, min, max))
    }
    catch {}
  }, [key, min, max])

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startW = widthRef.current
    const move = (ev: PointerEvent) => setWidth(clamp(startW + dir * (ev.clientX - startX), min, max))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        localStorage.setItem(key, String(Math.round(widthRef.current)))
      }
      catch {}
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [key, min, max, dir])

  return { width, onPointerDown }
}

/** The single 1px border between two panels, doubling as a drag handle. */
function Resizer({ onPointerDown, label }: { onPointerDown: (e: ReactPointerEvent) => void, label: string }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={onPointerDown}
      className="group bg-border relative w-px shrink-0 cursor-col-resize"
    >
      <div className="group-hover:bg-primary/40 group-active:bg-primary/60 absolute inset-y-0 -left-1 -right-1 z-10 transition-colors" />
    </div>
  )
}

function ConnectionBadge() {
  const { rpc, error } = useRpc()
  if (error)
    return <Badge variant="destructive">disconnected</Badge>
  if (!rpc)
    return <Badge variant="secondary">connecting…</Badge>
  const backend = rpc.connectionMeta.backend
  return (
    <Badge variant={backend === 'websocket' ? 'success' : 'secondary'} className="font-mono">
      {backend === 'websocket' ? 'live' : 'static'}
    </Badge>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon" className="size-7" onClick={toggle} aria-label="Toggle light/dark theme">
      {theme === 'dark' ? <Icon name="i-ph-sun-duotone" className="size-3.5" /> : <Icon name="i-ph-moon-duotone" className="size-3.5" />}
    </Button>
  )
}

function BranchRow({
  branch,
  selected,
  onSelect,
}: {
  branch: Branch
  selected: boolean
  onSelect: (name: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(branch.name)}
        className={cn(
          'hover:bg-accent/60 w-full rounded-md px-2 py-1.5 text-left transition-colors',
          selected && 'bg-accent',
        )}
      >
        <div className="flex items-center gap-2">
          <Icon name="i-ph-git-branch-duotone" className={cn('size-3.5', branch.current ? 'text-primary' : 'text-muted-foreground')} />
          <span className="truncate font-mono text-xs" title={branch.name}>{branch.name}</span>
          {branch.current && <Badge variant="success" className="px-1 py-0 text-[10px]">current</Badge>}
        </div>
        {(branch.ahead > 0 || branch.behind > 0) && (
          <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
            {branch.ahead > 0 && `ahead ${branch.ahead}`}
            {branch.ahead > 0 && branch.behind > 0 && ' · '}
            {branch.behind > 0 && `behind ${branch.behind}`}
          </p>
        )}
      </button>
    </li>
  )
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
      {children}
    </div>
  )
}

function DashboardBody() {
  const [pane, setPane] = useState<DashboardPane>('commits')
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)

  const leftRail = useRailWidth('devframe-git:rail-left', 264, 200, 420, 1)
  const rightRail = useRailWidth('devframe-git:rail-right', 360, 280, 560, -1)

  const branchesLoader = useCallback((rpc: DevframeRpcClient) => rpc.call('git:branches'), [])
  const {
    data: branches,
    loading: branchesLoading,
    error: branchesError,
    refresh: refreshBranches,
  } = useRpcResource<GitBranches>(branchesLoader)

  useEffect(() => {
    if (!branches?.isRepo) {
      setSelectedBranch(null)
      return
    }
    const names = branches.branches.map(branch => branch.name)
    const current = branches.current
      ?? branches.branches.find(branch => branch.current)?.name
      ?? null
    setSelectedBranch(prev => (prev && names.includes(prev)) ? prev : (current ?? names[0] ?? null))
  }, [branches])

  const selectBranch = (name: string) => {
    setSelectedBranch(name)
    setSelectedCommit(null)
    setPane('commits')
  }

  const showCommitDetails = pane === 'commits' && selectedCommit !== null

  return (
    <div className="bg-background flex h-svh w-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
            <Icon name="i-ph-graph-duotone" className="size-5" />
          </div>
          <div>
            <h1 className="text-sm leading-none font-semibold">Git Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-[11px] leading-none">
              devframe · type-safe RPC into the host repository
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge />
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left rail: views + branch picker, then the branch list. */}
        <aside className="flex min-h-0 flex-col" style={{ width: leftRail.width }}>
          <div className="shrink-0 space-y-3 border-b p-3">
            <div className="space-y-1.5">
              <label htmlFor="branch-select" className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Branch
              </label>
              <select
                id="branch-select"
                value={selectedBranch ?? ''}
                onChange={event => selectBranch(event.target.value)}
                disabled={branchesLoading || !branches?.isRepo || branches.branches.length === 0}
                className="bg-background border-input focus:ring-ring h-9 w-full rounded-md border px-2 text-sm outline-none focus:ring-2"
              >
                {!branches?.isRepo && <option value="">Not a repository</option>}
                {branches?.isRepo && branches.branches.length === 0 && <option value="">No branches</option>}
                {branches?.isRepo && branches.branches.map(branch => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </div>

            <nav className="space-y-1">
              {NAV_ITEMS.map(({ id, label, icon }) => (
                <Button
                  key={id}
                  type="button"
                  variant={pane === id ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setPane(id)}
                >
                  <Icon name={icon} className="size-4" />
                  {label}
                </Button>
              ))}
            </nav>

            {branchesError && <p className="text-destructive text-xs">{branchesError}</p>}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <PanelHeading>
              <span className="text-xs font-medium">Branches</span>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {branches?.isRepo ? branches.branches.length : ''}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={refreshBranches}
                  disabled={branchesLoading}
                  aria-label="Refresh branches"
                >
                  <Icon name="i-ph-arrows-clockwise" className={cn('size-3.5', branchesLoading && 'animate-spin')} />
                </Button>
              </div>
            </PanelHeading>

            <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-2">
              {!branches && (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              )}

              {branches && !branches.isRepo && (
                <p className="text-muted-foreground p-2 text-sm">The working directory is not a git repository.</p>
              )}

              {branches?.isRepo && (
                <ul className="space-y-0.5">
                  {branches.branches.map(branch => (
                    <BranchRow
                      key={branch.name}
                      branch={branch}
                      selected={branch.name === selectedBranch}
                      onSelect={selectBranch}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <Resizer onPointerDown={leftRail.onPointerDown} label="Resize sidebar" />

        {/* Center: the active pane, scrolling inside its own region. */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {pane === 'commits' && (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <LogPanel
                branch={selectedBranch}
                selectedHash={selectedCommit}
                onSelectCommit={setSelectedCommit}
              />
            </div>
          )}
          {pane === 'status' && (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <StatusPanel />
            </div>
          )}
          {pane === 'diff' && (
            <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-3">
              <DiffPanel />
            </div>
          )}
        </section>

        {showCommitDetails && selectedCommit && (
          <>
            <Resizer onPointerDown={rightRail.onPointerDown} label="Resize commit details" />
            <aside className="flex min-h-0 flex-col p-3" style={{ width: rightRail.width }}>
              <CommitDetailsPanel
                hash={selectedCommit}
                onClose={() => setSelectedCommit(null)}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  )
}

export function Dashboard() {
  return (
    <RpcProvider>
      <DashboardBody />
    </RpcProvider>
  )
}
