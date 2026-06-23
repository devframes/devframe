'use client'

import type { CommitDetail } from '../../../index'
import { GitCommitHorizontal, Tag, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'
import { DiffPatchView } from './diff-panel-view'

export interface CommitDetailsViewProps {
  data: CommitDetail | null
  loading: boolean
  error: string | null
  onClose?: () => void
}

function formatDate(epoch: number): string {
  if (!epoch)
    return ''
  return new Date(epoch).toLocaleString()
}

function RefBadge({ label }: { label: string }) {
  const isTag = label.startsWith('tag: ')
  const text = isTag ? label.slice(5) : label
  return (
    <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
      {isTag && <Tag className="size-3" />}
      {text}
    </Badge>
  )
}

export function CommitDetailsView({ data, loading, error, onClose }: CommitDetailsViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitCommitHorizontal className="text-primary size-4 shrink-0" />
          <h2 className="text-sm leading-none font-semibold">Commit details</h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close commit details">
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {!error && (loading || !data) && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!error && data && !data.found && (
        <p className="text-muted-foreground text-sm">Commit not found.</p>
      )}

      {!error && data && data.found && (
        <ScrollArea className="h-[calc(100vh-13rem)] pr-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm leading-snug font-medium break-words">{data.subject}</p>
              {data.refs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {data.refs.map(ref => <RefBadge key={ref} label={ref} />)}
                </div>
              )}
            </div>

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Commit</dt>
              <dd className="truncate font-mono tabular-nums" title={data.hash}>{data.shortHash}</dd>

              <dt className="text-muted-foreground">Author</dt>
              <dd className="truncate">
                {data.author}
                <span className="text-muted-foreground">{` <${data.email}>`}</span>
              </dd>

              <dt className="text-muted-foreground">Authored</dt>
              <dd className="truncate">{formatDate(data.date)}</dd>

              {data.committer !== data.author && (
                <>
                  <dt className="text-muted-foreground">Committer</dt>
                  <dd className="truncate">{data.committer}</dd>
                </>
              )}

              {data.parents.length > 0 && (
                <>
                  <dt className="text-muted-foreground">
                    {data.parents.length > 1 ? 'Parents' : 'Parent'}
                  </dt>
                  <dd className="truncate font-mono tabular-nums">
                    {data.parents.map(p => p.slice(0, 7)).join(', ')}
                  </dd>
                </>
              )}
            </dl>

            {data.body && (
              <pre className="bg-muted/40 scrollbar-slim max-h-48 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                {data.body}
              </pre>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {`${data.files.length} ${data.files.length === 1 ? 'file' : 'files'} changed`}
                </span>
                <span className="text-xs tabular-nums">
                  <span className="text-success">{`+${data.totalAdditions}`}</span>
                  {' '}
                  <span className="text-destructive">{`−${data.totalDeletions}`}</span>
                </span>
              </div>
              <ul className="space-y-0.5">
                {data.files.map(file => (
                  <li key={file.path} className="flex items-center gap-2 font-mono text-xs">
                    <span className="min-w-0 flex-1 truncate" title={file.path}>{file.path}</span>
                    {file.binary
                      ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">bin</Badge>
                      : (
                          <span className="shrink-0 tabular-nums">
                            <span className="text-success">{`+${file.additions}`}</span>
                            {' '}
                            <span className="text-destructive">{`−${file.deletions}`}</span>
                          </span>
                        )}
                  </li>
                ))}
              </ul>
            </div>

            <div className={cn('overflow-hidden rounded-md border')}>
              <div className="bg-muted/50 border-b px-3 py-1 text-xs font-medium">Patch</div>
              {data.patch !== null
                ? <DiffPatchView patch={data.patch} loading={false} truncated={data.truncated} />
                : <p className="text-muted-foreground p-3 text-xs">Patch is not available in static builds.</p>}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
