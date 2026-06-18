'use client'

import type { FileStatusCode, StatusFileEntry } from '../../index'
import { ArrowDown, ArrowUp, Check, GitBranch, RefreshCw } from 'lucide-react'
import { useCallback } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'
import { useRpcResource } from './use-rpc-resource'

const STATUS_LABEL: Record<FileStatusCode, string> = {
  'modified': 'M',
  'added': 'A',
  'deleted': 'D',
  'renamed': 'R',
  'copied': 'C',
  'type-changed': 'T',
  'unmerged': 'U',
  'unknown': '?',
}

function statusColor(code: FileStatusCode): string {
  switch (code) {
    case 'added': return 'text-success'
    case 'deleted': return 'text-destructive'
    case 'modified': return 'text-warning'
    case 'unmerged': return 'text-destructive'
    default: return 'text-muted-foreground'
  }
}

function FileRow({ entry }: { entry: StatusFileEntry }) {
  return (
    <li className="flex items-center gap-2 py-0.5 font-mono text-xs">
      <span className={`w-3 shrink-0 text-center font-semibold ${statusColor(entry.status)}`}>
        {STATUS_LABEL[entry.status]}
      </span>
      <span className="truncate">
        {entry.from ? `${entry.from} → ${entry.path}` : entry.path}
      </span>
    </li>
  )
}

function Section({ title, count, children }: { title: string, count: number, children: React.ReactNode }) {
  if (count === 0)
    return null
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
        {title}
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{count}</Badge>
      </div>
      <ul>{children}</ul>
    </div>
  )
}

export function StatusPanel() {
  const loader = useCallback((rpc: import('devframe/client').DevframeRpcClient) => rpc.call('git:status'), [])
  const { data, loading, refresh } = useRpcResource(loader)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {data?.isRepo
            ? (
                <>
                  <Badge variant="outline" className="gap-1 font-mono">
                    <GitBranch className="size-3" />
                    {data.detached ? `detached @ ${data.head}` : data.branch}
                  </Badge>
                  {data.upstream && (
                    <Badge variant="secondary" className="gap-1 font-mono">
                      {data.upstream}
                      {data.ahead > 0 && (
                        <span className="text-success inline-flex items-center">
                          <ArrowUp className="size-3" />
                          {data.ahead}
                        </span>
                      )}
                      {data.behind > 0 && (
                        <span className="text-warning inline-flex items-center">
                          <ArrowDown className="size-3" />
                          {data.behind}
                        </span>
                      )}
                    </Badge>
                  )}
                  {data.clean
                    ? (
                        <Badge variant="success" className="gap-1">
                          <Check className="size-3" />
                          clean
                        </Badge>
                      )
                    : <Badge variant="warning">working tree dirty</Badge>}
                </>
              )
            : <Skeleton className="h-5 w-40" />}
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} aria-label="Refresh status">
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {data && !data.isRepo && (
        <p className="text-muted-foreground text-sm">The working directory is not a git repository.</p>
      )}

      {data?.isRepo && data.clean && (
        <p className="text-muted-foreground text-sm">Nothing to commit — the working tree is clean.</p>
      )}

      {data?.isRepo && !data.clean && (
        <ScrollArea className="h-72 pr-3">
          <div className="space-y-4">
            <Section title="Staged" count={data.staged.length}>
              {data.staged.map(entry => <FileRow key={`s:${entry.path}`} entry={entry} />)}
            </Section>
            <Section title="Unstaged" count={data.unstaged.length}>
              {data.unstaged.map(entry => <FileRow key={`u:${entry.path}`} entry={entry} />)}
            </Section>
            <Section title="Untracked" count={data.untracked.length}>
              {data.untracked.map(path => (
                <FileRow key={`t:${path}`} entry={{ path, status: 'unknown' }} />
              ))}
            </Section>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
