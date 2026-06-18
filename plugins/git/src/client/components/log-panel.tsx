'use client'

import type { DevframeRpcClient } from 'devframe/client'
import type { Commit } from '../../index'
import { RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'
import { useRpcResource } from './use-rpc-resource'

const PAGE = 30

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

function CommitRow({ commit }: { commit: Commit }) {
  return (
    <li className="border-border/60 flex flex-col gap-1 border-b py-2 last:border-0">
      <div className="flex items-baseline gap-2">
        <code className="text-muted-foreground shrink-0 text-xs">{commit.shortHash}</code>
        <span className="truncate text-sm font-medium">{commit.subject}</span>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span>{commit.author}</span>
        <span aria-hidden>·</span>
        <span title={new Date(commit.date).toLocaleString()}>{relativeTime(commit.date)}</span>
        {commit.refs.map(ref => (
          <Badge key={ref} variant="outline" className="px-1.5 py-0 font-mono text-[10px]">{ref}</Badge>
        ))}
      </div>
    </li>
  )
}

export function LogPanel() {
  const [limit, setLimit] = useState(PAGE)
  const loader = useCallback(
    (rpc: DevframeRpcClient) => rpc.call('git:log', { limit }),
    [limit],
  )
  const { data, loading, refresh } = useRpcResource(loader)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {data?.isRepo ? `${data.commits.length} commits` : ' '}
        </span>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} aria-label="Refresh log">
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {!data && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {data && !data.isRepo && (
        <p className="text-muted-foreground text-sm">The working directory is not a git repository.</p>
      )}

      {data?.isRepo && data.commits.length === 0 && (
        <p className="text-muted-foreground text-sm">No commits yet.</p>
      )}

      {data?.isRepo && data.commits.length > 0 && (
        <ScrollArea className="h-80 pr-3">
          <ul>
            {data.commits.map(commit => <CommitRow key={commit.hash} commit={commit} />)}
          </ul>
        </ScrollArea>
      )}

      {data?.hasMore && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setLimit(l => l + PAGE)} disabled={loading}>
          Load more
        </Button>
      )}
    </div>
  )
}
