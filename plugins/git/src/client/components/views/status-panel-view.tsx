'use client'

import type { ReactNode } from 'react'
import type { FileStatusCode, GitStatus, StatusFileEntry } from '../../../index'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'
import { Textarea } from '../ui/textarea'

export interface StatusPanelViewProps {
  data: GitStatus | null
  loading: boolean
  busy: boolean
  canWrite: boolean
  message: string
  note: string | null
  onRefresh: () => void | Promise<void>
  onStage: (paths: string[]) => void | Promise<void>
  onUnstage: (paths: string[]) => void | Promise<void>
  onCommit: () => void | Promise<void>
  onMessageChange: (value: string) => void
}

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

function FileRow({ entry, action }: { entry: StatusFileEntry, action?: ReactNode }) {
  const label = entry.from ? `${entry.from} → ${entry.path}` : entry.path
  return (
    <li className="hover:bg-accent/40 flex items-center gap-2 rounded py-0.5 pl-1 font-mono text-xs transition-colors">
      <span className={`w-3 shrink-0 text-center font-semibold ${statusColor(entry.status)}`}>
        {STATUS_LABEL[entry.status]}
      </span>
      <span className="flex-1 truncate" title={label}>
        {label}
      </span>
      {action}
    </li>
  )
}

function Section({
  title,
  count,
  headerAction,
  children,
}: {
  title: string
  count: number
  headerAction?: ReactNode
  children: ReactNode
}) {
  if (count === 0)
    return null
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          {title}
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">{count}</Badge>
        </div>
        {headerAction}
      </div>
      <ul>{children}</ul>
    </div>
  )
}

export function StatusPanelView(props: StatusPanelViewProps) {
  const { data, loading, busy, canWrite, message, note, onRefresh, onStage, onUnstage, onCommit, onMessageChange } = props

  const stageBtn = (paths: string[], label: string) => (
    <Button variant="ghost" size="icon" className="size-6" disabled={busy} aria-label={label} onClick={() => onStage(paths)}>
      <Icon name="i-ph-plus" className="size-3.5" />
    </Button>
  )
  const unstageBtn = (paths: string[], label: string) => (
    <Button variant="ghost" size="icon" className="size-6" disabled={busy} aria-label={label} onClick={() => onUnstage(paths)}>
      <Icon name="i-ph-minus" className="size-3.5" />
    </Button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {data?.isRepo
            ? (
                <>
                  <Badge variant="outline" className="gap-1 font-mono">
                    <Icon name="i-ph-git-branch-duotone" className="size-3" />
                    {data.detached ? `detached @ ${data.head}` : data.branch}
                  </Badge>
                  {data.upstream && (
                    <Badge variant="secondary" className="gap-1 font-mono">
                      {data.upstream}
                      {data.ahead > 0 && (
                        <span className="text-success inline-flex items-center tabular-nums">
                          <Icon name="i-ph-arrow-up" className="size-3" />
                          {data.ahead}
                        </span>
                      )}
                      {data.behind > 0 && (
                        <span className="text-warning inline-flex items-center tabular-nums">
                          <Icon name="i-ph-arrow-down" className="size-3" />
                          {data.behind}
                        </span>
                      )}
                    </Badge>
                  )}
                  {data.clean
                    ? (
                        <Badge variant="success" className="gap-1">
                          <Icon name="i-ph-check" className="size-3" />
                          clean
                        </Badge>
                      )
                    : <Badge variant="warning">working tree dirty</Badge>}
                </>
              )
            : <Skeleton className="h-5 w-40" />}
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onRefresh} disabled={loading || busy} aria-label="Refresh status">
          <Icon name="i-ph-arrows-clockwise" className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {data && !data.isRepo && (
        <p className="text-muted-foreground text-sm">The working directory is not a git repository.</p>
      )}

      {data?.isRepo && data.clean && (
        <p className="text-muted-foreground text-sm">Nothing to commit. The working tree is clean.</p>
      )}

      {data?.isRepo && !data.clean && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ScrollArea className="scrollbar-slim min-h-0 flex-1 pr-3">
            <div className="space-y-4">
              <Section
                title="Staged"
                count={data.staged.length}
                headerAction={canWrite && data.staged.length > 0
                  ? <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={busy} onClick={() => onUnstage(data.staged.map(f => f.path))}>Unstage all</Button>
                  : undefined}
              >
                {data.staged.map(entry => (
                  <FileRow
                    key={`s:${entry.path}`}
                    entry={entry}
                    action={canWrite ? unstageBtn([entry.path], `Unstage ${entry.path}`) : undefined}
                  />
                ))}
              </Section>

              <Section
                title="Unstaged"
                count={data.unstaged.length}
                headerAction={canWrite && data.unstaged.length > 0
                  ? <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={busy} onClick={() => onStage(data.unstaged.map(f => f.path))}>Stage all</Button>
                  : undefined}
              >
                {data.unstaged.map(entry => (
                  <FileRow
                    key={`u:${entry.path}`}
                    entry={entry}
                    action={canWrite ? stageBtn([entry.path], `Stage ${entry.path}`) : undefined}
                  />
                ))}
              </Section>

              <Section
                title="Untracked"
                count={data.untracked.length}
                headerAction={canWrite && data.untracked.length > 0
                  ? <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={busy} onClick={() => onStage(data.untracked)}>Stage all</Button>
                  : undefined}
              >
                {data.untracked.map(path => (
                  <FileRow
                    key={`t:${path}`}
                    entry={{ path, status: 'unknown' }}
                    action={canWrite ? stageBtn([path], `Stage ${path}`) : undefined}
                  />
                ))}
              </Section>
            </div>
          </ScrollArea>

          {canWrite && data.staged.length > 0 && (
            <div className="shrink-0 space-y-2 border-t pt-3">
              <Textarea
                value={message}
                onChange={e => onMessageChange(e.target.value)}
                placeholder="Commit message"
                rows={2}
                disabled={busy}
                aria-label="Commit message"
              />
              {note && <p className="text-destructive text-xs">{note}</p>}
              <Button size="sm" className="tabular-nums" onClick={onCommit} disabled={busy || message.trim().length === 0}>
                {`Commit ${data.staged.length} file${data.staged.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
