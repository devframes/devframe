'use client'

import type { Branch, GitBranches } from '../../../index'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'

export interface BranchesPanelViewProps {
  data: GitBranches | null
  loading: boolean
  onRefresh: () => void | Promise<void>
}

function BranchRow({ branch }: { branch: Branch }) {
  return (
    <li className="border-border/60 flex items-center gap-2 border-b py-1.5 last:border-0">
      <Icon name="i-ph-git-branch-duotone" className={`size-4 ${branch.current ? 'text-primary' : 'text-muted-foreground'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate font-mono text-xs ${branch.current ? 'font-semibold' : ''}`} title={branch.name}>
            {branch.name}
          </span>
          {branch.current && (
            <Badge variant="success" className="gap-1 px-1.5 py-0 text-[10px]">
              <Icon name="i-ph-check" className="size-3" />
              current
            </Badge>
          )}
          {branch.gone && <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">upstream gone</Badge>}
        </div>
        {branch.subject && <p className="text-muted-foreground truncate text-xs" title={branch.subject}>{branch.subject}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {branch.ahead > 0 && (
          <span className="text-success inline-flex items-center text-xs tabular-nums">
            <Icon name="i-ph-arrow-up" className="size-3" />
            {branch.ahead}
          </span>
        )}
        {branch.behind > 0 && (
          <span className="text-warning inline-flex items-center text-xs tabular-nums">
            <Icon name="i-ph-arrow-down" className="size-3" />
            {branch.behind}
          </span>
        )}
        <code className="text-muted-foreground text-xs tabular-nums">{branch.sha}</code>
      </div>
    </li>
  )
}

export function BranchesPanelView({ data, loading, onRefresh }: BranchesPanelViewProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs tabular-nums">
          {data?.isRepo ? `${data.branches.length} branches` : ' '}
        </span>
        <Button variant="ghost" size="icon" className="size-7" onClick={onRefresh} disabled={loading} aria-label="Refresh branches">
          <Icon name="i-ph-arrows-clockwise" className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
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
