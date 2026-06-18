'use client'

import type { DevframeRpcClient } from 'devframe/client'
import type { Branch } from '../../index'
import { ArrowDown, ArrowUp, Check, GitBranch, RefreshCw } from 'lucide-react'
import { useCallback } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'
import { useRpcResource } from './use-rpc-resource'

function BranchRow({ branch }: { branch: Branch }) {
  return (
    <li className="border-border/60 flex items-center gap-2 border-b py-2 last:border-0">
      <GitBranch className={`size-4 shrink-0 ${branch.current ? 'text-primary' : 'text-muted-foreground'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate font-mono text-sm ${branch.current ? 'font-semibold' : ''}`}>
            {branch.name}
          </span>
          {branch.current && (
            <Badge variant="success" className="gap-1 px-1.5 py-0 text-[10px]">
              <Check className="size-3" />
              current
            </Badge>
          )}
          {branch.gone && <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">upstream gone</Badge>}
        </div>
        {branch.subject && <p className="text-muted-foreground truncate text-xs">{branch.subject}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {branch.ahead > 0 && (
          <span className="text-success inline-flex items-center text-xs">
            <ArrowUp className="size-3" />
            {branch.ahead}
          </span>
        )}
        {branch.behind > 0 && (
          <span className="text-warning inline-flex items-center text-xs">
            <ArrowDown className="size-3" />
            {branch.behind}
          </span>
        )}
        <code className="text-muted-foreground text-xs">{branch.sha}</code>
      </div>
    </li>
  )
}

export function BranchesPanel() {
  const loader = useCallback((rpc: DevframeRpcClient) => rpc.call('git:branches'), [])
  const { data, loading, refresh } = useRpcResource(loader)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {data?.isRepo ? `${data.branches.length} branches` : ' '}
        </span>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} aria-label="Refresh branches">
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {!data && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {data && !data.isRepo && (
        <p className="text-muted-foreground text-sm">The working directory is not a git repository.</p>
      )}

      {data?.isRepo && data.branches.length > 0 && (
        <ScrollArea className="h-80 pr-3">
          <ul>
            {data.branches.map(branch => <BranchRow key={branch.name} branch={branch} />)}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}
