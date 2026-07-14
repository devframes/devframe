'use client'

import type { ReactNode } from 'react'
import type { GitStatus, StatusFileEntry } from '../../../index'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button, IconButton } from '../ui/button'
import { FileIcon } from '../ui/file-icon'
import { Icon } from '../ui/icon'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'
import { StatusMark } from '../ui/status-mark'
import { Textarea } from '../ui/textarea'

export interface StatusPanelViewProps {
  data: GitStatus | null
  loading: boolean
  busy: boolean
  canWrite: boolean
  message: string
  note: string | null
  /** `${staged}:${path}` of the file whose diff is shown, or `null`. */
  selectedKey?: string | null
  onRefresh: () => void | Promise<void>
  onStage: (paths: string[]) => void | Promise<void>
  onUnstage: (paths: string[]) => void | Promise<void>
  onCommit: () => void | Promise<void>
  onMessageChange: (value: string) => void
  /** Reveal a file's diff. `staged` picks the index-vs-HEAD diff. */
  onSelectFile?: (path: string, staged: boolean) => void
  /** The selected file's diff viewer, rendered below the file list. */
  patchSlot?: ReactNode
}

function fileKey(path: string, staged: boolean): string {
  return `${staged}:${path}`
}

function FileRow({ entry, staged, selected, action, onSelect }: {
  entry: StatusFileEntry
  staged: boolean
  selected: boolean
  action?: ReactNode
  onSelect?: (path: string, staged: boolean) => void
}) {
  const label = entry.from ? `${entry.from} → ${entry.path}` : entry.path
  return (
    <li
      className={cn(
        'group flex items-center gap-1 rounded pr-1 transition-colors',
        selected ? 'bg-active' : 'hover:bg-active',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect?.(entry.path, staged)}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 pl-1 text-left text-xs outline-none"
      >
        <StatusMark code={entry.status} />
        <FileIcon path={entry.path} className="size-4" />
        <span className="min-w-0 flex-1 truncate font-mono" title={label}>{label}</span>
      </button>
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
        <div className="color-muted flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
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
  const { data, loading, busy, canWrite, message, note, selectedKey, onRefresh, onStage, onUnstage, onCommit, onMessageChange, onSelectFile, patchSlot } = props

  const stageBtn = (paths: string[], label: string) => (
    <IconButton variant="ghost" size="sm" disabled={busy} aria-label={label} onClick={() => onStage(paths)}>
      <Icon name="i-ph-plus" className="size-4" />
    </IconButton>
  )
  const unstageBtn = (paths: string[], label: string) => (
    <IconButton variant="ghost" size="sm" disabled={busy} aria-label={label} onClick={() => onUnstage(paths)}>
      <Icon name="i-ph-minus" className="size-4" />
    </IconButton>
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="text-lg leading-none font-semibold tracking-tight">Changes</h2>
          {data?.isRepo && !data.clean && (
            <span className="color-muted shrink-0 text-xs tabular-nums">
              {data.staged.length + data.unstaged.length + data.untracked.length}
              {' '}
              changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data?.isRepo && (data.ahead > 0 || data.behind > 0) && (
            <Badge variant="secondary" className="gap-1 font-mono">
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
          <IconButton variant="ghost" size="sm" onClick={onRefresh} disabled={loading || busy} aria-label="Refresh status">
            <Icon name="i-ph-arrows-clockwise" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </IconButton>
        </div>
      </div>

      {!data && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      )}

      {data && !data.isRepo && (
        <p className="color-muted text-sm">The working directory is not a git repository.</p>
      )}

      {data?.isRepo && data.clean && (
        <p className="color-muted text-sm">Nothing to commit. The working tree is clean.</p>
      )}

      {data?.isRepo && !data.clean && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <div className="space-y-4">
              <Section
                title="Staged"
                count={data.staged.length}
                headerAction={canWrite && data.staged.length > 0
                  ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => onUnstage(data.staged.map(f => f.path))}>Unstage all</Button>
                  : undefined}
              >
                {data.staged.map(entry => (
                  <FileRow
                    key={`s:${entry.path}`}
                    entry={entry}
                    staged
                    selected={selectedKey === fileKey(entry.path, true)}
                    onSelect={onSelectFile}
                    action={canWrite ? unstageBtn([entry.path], `Unstage ${entry.path}`) : undefined}
                  />
                ))}
              </Section>

              <Section
                title="Unstaged"
                count={data.unstaged.length}
                headerAction={canWrite && data.unstaged.length > 0
                  ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => onStage(data.unstaged.map(f => f.path))}>Stage all</Button>
                  : undefined}
              >
                {data.unstaged.map(entry => (
                  <FileRow
                    key={`u:${entry.path}`}
                    entry={entry}
                    staged={false}
                    selected={selectedKey === fileKey(entry.path, false)}
                    onSelect={onSelectFile}
                    action={canWrite ? stageBtn([entry.path], `Stage ${entry.path}`) : undefined}
                  />
                ))}
              </Section>

              <Section
                title="Untracked"
                count={data.untracked.length}
                headerAction={canWrite && data.untracked.length > 0
                  ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => onStage(data.untracked)}>Stage all</Button>
                  : undefined}
              >
                {data.untracked.map(path => (
                  <FileRow
                    key={`t:${path}`}
                    entry={{ path, status: 'unknown' }}
                    staged={false}
                    selected={selectedKey === fileKey(path, false)}
                    onSelect={onSelectFile}
                    action={canWrite ? stageBtn([path], `Stage ${path}`) : undefined}
                  />
                ))}
              </Section>
            </div>
          </ScrollArea>

          {patchSlot && (
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
              {patchSlot}
            </div>
          )}

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
              {note && <p className="text-error text-xs">{note}</p>}
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
