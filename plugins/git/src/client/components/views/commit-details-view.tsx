'use client'

import type { CommitDetail } from '../../../index'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { IconButton } from '../ui/button'
import { Icon } from '../ui/icon'
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
      {isTag && <Icon name="i-ph-tag-duotone" className="size-3" />}
      {text}
    </Badge>
  )
}

export function CommitDetailsView({ data, loading, error, onClose }: CommitDetailsViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="i-ph-git-commit-duotone" className="color-active size-4" />
          <h2 className="text-sm leading-none font-semibold">Commit details</h2>
        </div>
        {onClose && (
          <IconButton variant="ghost" size="sm" onClick={onClose} aria-label="Close commit details">
            <Icon name="i-ph-x" className="size-4" />
          </IconButton>
        )}
      </div>

      {error && <p className="text-error text-sm">{error}</p>}

      {!error && (loading || !data) && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!error && data && !data.found && (
        <p className="color-muted text-sm">Commit not found.</p>
      )}

      {!error && data && data.found && (
        <ScrollArea className="min-h-0 flex-1 pr-2">
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
              <dt className="color-muted">Commit</dt>
              <dd className="truncate font-mono tabular-nums" title={data.hash}>{data.shortHash}</dd>

              <dt className="color-muted">Author</dt>
              <dd className="truncate">
                {data.author}
                <span className="color-muted">{` <${data.email}>`}</span>
              </dd>

              <dt className="color-muted">Authored</dt>
              <dd className="truncate">{formatDate(data.date)}</dd>

              {data.committer !== data.author && (
                <>
                  <dt className="color-muted">Committer</dt>
                  <dd className="truncate">{data.committer}</dd>
                </>
              )}

              {data.parents.length > 0 && (
                <>
                  <dt className="color-muted">
                    {data.parents.length > 1 ? 'Parents' : 'Parent'}
                  </dt>
                  <dd className="truncate font-mono tabular-nums">
                    {data.parents.map(p => p.slice(0, 7)).join(', ')}
                  </dd>
                </>
              )}
            </dl>

            {data.body && (
              <pre className="bg-secondary max-h-48 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                {data.body}
              </pre>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="color-muted text-xs font-medium tracking-wide uppercase">
                  {`${data.files.length} ${data.files.length === 1 ? 'file' : 'files'} changed`}
                </span>
                <span className="text-xs tabular-nums">
                  <span className="text-success">{`+${data.totalAdditions}`}</span>
                  {' '}
                  <span className="text-error">{`−${data.totalDeletions}`}</span>
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
                            <span className="text-error">{`−${file.deletions}`}</span>
                          </span>
                        )}
                  </li>
                ))}
              </ul>
            </div>

            <div className={cn('overflow-hidden rounded-md border')}>
              <div className="bg-secondary border-b px-3 py-1 text-xs font-medium">Patch</div>
              {data.patch !== null
                ? <DiffPatchView patch={data.patch} loading={false} truncated={data.truncated} scroll={false} />
                : <p className="color-muted p-3 text-xs">Patch is not available in static builds.</p>}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
