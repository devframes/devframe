'use client'

import type { DevframeRpcClient } from 'devframe/client'
import type { Branch, GitBranches } from '../../index'
import { FileDiff, GitBranch, GitCommitHorizontal, GitGraph, ListTree, Moon, RefreshCw, Sun } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import { DiffPanel } from './diff-panel'
import { LogPanel } from './log-panel'
import { RpcProvider, useRpc } from './rpc-provider'
import { StatusPanel } from './status-panel'
import { useTheme } from './theme'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'
import { useRpcResource } from './use-rpc-resource'

type DashboardPane = 'status' | 'commits' | 'diff'

interface NavItem {
  id: DashboardPane
  label: string
  icon: typeof ListTree
}

const NAV_ITEMS: NavItem[] = [
  { id: 'status', label: 'Status', icon: ListTree },
  { id: 'commits', label: 'Commits', icon: GitCommitHorizontal },
  { id: 'diff', label: 'Diff', icon: FileDiff },
]

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
      {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
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
          <GitBranch className={cn('size-3.5 shrink-0', branch.current ? 'text-primary' : 'text-muted-foreground')} />
          <span className="truncate font-mono text-xs">{branch.name}</span>
          {branch.current && <Badge variant="success" className="px-1 py-0 text-[10px]">current</Badge>}
        </div>
        {(branch.ahead > 0 || branch.behind > 0) && (
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {branch.ahead > 0 && `ahead ${branch.ahead}`}
            {branch.ahead > 0 && branch.behind > 0 && ' · '}
            {branch.behind > 0 && `behind ${branch.behind}`}
          </p>
        )}
      </button>
    </li>
  )
}

function DashboardBody() {
  const [pane, setPane] = useState<DashboardPane>('commits')
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)

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
    setPane('commits')
  }

  return (
    <main className="flex min-h-svh w-full flex-col gap-4 px-4 py-5 md:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitGraph className="text-primary size-6" />
          <div>
            <h1 className="text-base leading-none font-semibold">Git Dashboard</h1>
            <p className="text-muted-foreground text-[11px]">
              devframe + Next.js · type-safe RPC into the host repository
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge />
          <ThemeToggle />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Workspace</CardTitle>
              <CardDescription>Switch views and choose the log branch.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                  <Button
                    key={id}
                    type="button"
                    variant={pane === id ? 'secondary' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setPane(id)}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Button>
                ))}
              </nav>

              {branchesError && <p className="text-destructive text-xs">{branchesError}</p>}
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0">
          <Card className="h-full">
            <CardContent className="p-4">
              {pane === 'status' && <StatusPanel />}
              {pane === 'commits' && <LogPanel branch={selectedBranch} />}
              {pane === 'diff' && <DiffPanel />}
            </CardContent>
          </Card>
        </section>

        <aside className="hidden min-w-0 xl:block">
          <Card className="h-full">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm">Branches</CardTitle>
                <CardDescription>
                  {branches?.isRepo ? `${branches.branches.length} branches` : ' '}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={refreshBranches}
                disabled={branchesLoading}
                aria-label="Refresh branches"
              >
                <RefreshCw className={cn('size-3.5', branchesLoading && 'animate-spin')} />
              </Button>
            </CardHeader>
            <CardContent>
              {!branches && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              )}

              {branches && !branches.isRepo && (
                <p className="text-muted-foreground text-sm">The working directory is not a git repository.</p>
              )}

              {branches?.isRepo && (
                <ScrollArea className="h-[calc(100vh-16rem)] pr-2">
                  <ul className="space-y-1">
                    {branches.branches.map(branch => (
                      <BranchRow
                        key={branch.name}
                        branch={branch}
                        selected={branch.name === selectedBranch}
                        onSelect={selectBranch}
                      />
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  )
}

export function Dashboard() {
  return (
    <RpcProvider>
      <DashboardBody />
    </RpcProvider>
  )
}
