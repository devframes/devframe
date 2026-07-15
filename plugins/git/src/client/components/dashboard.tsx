'use client'

import type { DevframeRpcClient } from 'devframe/client'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { GitBranches } from '../../index'
import { useCallback, useEffect, useRef, useState } from 'react'
import { nav as navBar, navBrand, tab as tabClass, tabsList } from '../lib/design'
import { CommitDetailsPanel } from './commit-details-panel'
import { ConnectionState } from './connection-state'
import { LogPanel } from './log-panel'
import { RpcProvider, useRpc } from './rpc-provider'
import { StatusPanel } from './status-panel'
import { useTheme } from './theme'
import { Badge } from './ui/badge'
import { IconButton } from './ui/button'
import { Icon } from './ui/icon'
import { useRpcResource } from './use-rpc-resource'

type DashboardPane = 'commits' | 'changes'

interface NavItem {
  id: DashboardPane
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'commits', label: 'Commits', icon: 'i-ph-git-commit-duotone' },
  { id: 'changes', label: 'Changes', icon: 'i-ph-git-diff-duotone' },
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
      className="group bg-[#8882] relative w-px shrink-0 cursor-col-resize"
    >
      <div className="group-hover:bg-primary/40 group-active:bg-primary/60 absolute inset-y-0 -left-1 -right-1 z-10 transition-colors" />
    </div>
  )
}

function ConnectionBadge() {
  const { rpc, status } = useRpc()
  if (status === 'error' || status === 'disconnected')
    return <Badge variant="destructive">{status}</Badge>
  if (status === 'unauthorized')
    return <Badge variant="warning">unauthorized</Badge>
  if (status === 'connecting' || !rpc)
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
    <IconButton variant="ghost" size="sm" onClick={toggle} aria-label="Toggle light/dark theme">
      <Icon name={theme === 'dark' ? 'i-ph-sun-duotone' : 'i-ph-moon-duotone'} className="size-4" />
    </IconButton>
  )
}

/** Branch picker, living in the nav bar. */
function BranchSelect({
  branches,
  disabled,
  value,
  onSelect,
}: {
  branches: GitBranches | null
  disabled: boolean
  value: string | null
  onSelect: (name: string) => void
}) {
  return (
    <label className="border-base bg-base focus-within:ring-primary-500/40 flex h-7 min-w-0 items-center gap-1.5 rounded-md border pr-1.5 pl-2 focus-within:ring-2">
      <Icon name="i-ph-git-branch-duotone" className="color-active size-3.5 shrink-0" />
      <select
        aria-label="Branch"
        value={value ?? ''}
        onChange={event => onSelect(event.target.value)}
        disabled={disabled}
        className="color-base h-full max-w-44 min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-4 text-sm outline-none disabled:cursor-default"
      >
        {!branches?.isRepo && <option value="">Not a repository</option>}
        {branches?.isRepo && branches.branches.length === 0 && <option value="">No branches</option>}
        {branches?.isRepo && branches.branches.map(branch => (
          <option key={branch.name} value={branch.name}>{branch.name}</option>
        ))}
      </select>
      <Icon name="i-ph-caret-up-down" className="color-faint pointer-events-none -ml-4 size-3.5 shrink-0" />
    </label>
  )
}

function DashboardBody() {
  const [pane, setPane] = useState<DashboardPane>('commits')
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)

  const rightRail = useRailWidth('devframe-git:rail-right', 480, 340, 760, -1)

  const branchesLoader = useCallback((rpc: DevframeRpcClient) => rpc.call('git:branches'), [])
  const {
    data: branches,
    loading: branchesLoading,
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
    <div className="bg-base flex h-svh w-full flex-col overflow-hidden">
      <header className={navBar()}>
        <div className={navBrand()}>
          <Icon name="i-ph-git-fork-duotone" className="text-base color-active" />
          <span>Git</span>
        </div>

        <BranchSelect
          branches={branches}
          disabled={branchesLoading || !branches?.isRepo || branches.branches.length === 0}
          value={selectedBranch}
          onSelect={selectBranch}
        />

        <nav className={tabsList()} role="tablist" aria-label="Git views">
          {NAV_ITEMS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane === id}
              data-state={pane === id ? 'active' : 'inactive'}
              className={tabClass()}
              onClick={() => setPane(id)}
            >
              <Icon name={icon} className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1" />
        <ConnectionBadge />
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Center: the active pane, scrolling inside its own region. */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {pane === 'commits' && (
            <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5">
              <LogPanel
                branch={selectedBranch}
                selectedHash={selectedCommit}
                onSelectCommit={setSelectedCommit}
              />
            </div>
          )}
          {pane === 'changes' && (
            <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5">
              <StatusPanel />
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

function DashboardGate() {
  const { status, error } = useRpc()
  // A static backend reports `connected` immediately; a websocket backend
  // shows the connection state until it's live, so data views never spin
  // against a socket that will never answer.
  if (status !== 'connected')
    return <ConnectionState status={status} error={error} />
  return <DashboardBody />
}

export function Dashboard() {
  return (
    <RpcProvider>
      <DashboardGate />
    </RpcProvider>
  )
}
