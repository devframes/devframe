'use client'

import type { ReactNode } from 'react'
import type { GitDiff } from '../../../index'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { IconButton } from '../ui/button'
import { Icon } from '../ui/icon'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'

export interface DiffPanelViewProps {
  data: GitDiff | null
  loading: boolean
  staged: boolean
  selected: string | null
  onSelectScope: (staged: boolean) => void
  onSelectFile: (path: string) => void
  onRefresh: () => void | Promise<void>
  /** Rendered below the file list when a file is selected (the patch viewer). */
  patchSlot?: ReactNode
}

function patchLineClass(line: string): string {
  if (line.startsWith('@@'))
    return 'color-active'
  if (line.startsWith('+') && !line.startsWith('+++'))
    return 'text-success'
  if (line.startsWith('-') && !line.startsWith('---'))
    return 'text-error'
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---'))
    return 'color-muted font-semibold'
  return 'color-base'
}

/**
 * Pure renderer for a unified patch. Set `scroll={false}` to render inline
 * (no inner scroll area) when the patch already sits in a scrolling parent.
 */
export function DiffPatchView({ patch, loading, truncated, scroll = true }: { patch: string | null, loading: boolean, truncated: boolean, scroll?: boolean }) {
  if (loading)
    return <Skeleton className="h-40 w-full" />
  if (!patch)
    return <p className="color-muted p-3 text-sm">No textual diff available (binary or unchanged).</p>
  const body = (
    <>
      <pre className="font-mono text-xs leading-relaxed">
        {patch.split('\n').map((line, i) => (
          <div key={i} className={cn('px-3 whitespace-pre', patchLineClass(line))}>{line || ' '}</div>
        ))}
      </pre>
      {truncated && <p className="text-warning px-3 py-1 text-xs">Patch truncated.</p>}
    </>
  )
  if (!scroll)
    return <div className="overflow-x-auto py-1">{body}</div>
  return <ScrollArea className="h-72 w-full">{body}</ScrollArea>
}

export function DiffPanelView(props: DiffPanelViewProps) {
  const { data, loading, staged, selected, onSelectScope, onSelectFile, onRefresh, patchSlot } = props
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="bg-secondary inline-flex rounded-lg p-[3px] text-sm">
          {([['Working tree', false], ['Staged', true]] as const).map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => onSelectScope(value)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1 font-medium transition-colors',
                staged === value ? 'bg-base color-base shadow-sm' : 'color-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {data?.isRepo && (
            <span className="text-xs tabular-nums">
              <span className="text-success">
                +
                {data.totalAdditions}
              </span>
              {' '}
              <span className="text-error">
                −
                {data.totalDeletions}
              </span>
            </span>
          )}
          <IconButton variant="ghost" size="sm" onClick={onRefresh} disabled={loading} aria-label="Refresh diff">
            <Icon name="i-ph-arrows-clockwise" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </IconButton>
        </div>
      </div>

      {!data && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      )}

      {data && !data.isRepo && (
        <p className="color-muted text-sm">The working directory is not a git repository.</p>
      )}

      {data?.isRepo && data.files.length === 0 && (
        <p className="color-muted text-sm">
          No
          {staged ? ' staged' : ' unstaged'}
          {' '}
          changes.
        </p>
      )}

      {data?.isRepo && data.files.length > 0 && (
        <>
          <ScrollArea className="h-40 pr-3">
            <ul>
              {data.files.map(file => (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => onSelectFile(file.path)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left font-mono text-xs',
                      selected === file.path ? 'bg-active' : 'hover:bg-active',
                    )}
                  >
                    <span className="flex-1 truncate" title={file.path}>{file.path}</span>
                    {file.binary
                      ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">bin</Badge>
                      : (
                          <span className="shrink-0 tabular-nums">
                            <span className="text-success">
                              +
                              {file.additions}
                            </span>
                            {' '}
                            <span className="text-error">
                              −
                              {file.deletions}
                            </span>
                          </span>
                        )}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>

          {selected && (
            <div className="overflow-hidden rounded-md border">
              <div className="bg-secondary border-b px-3 py-1 font-mono text-xs">{selected}</div>
              {patchSlot}
            </div>
          )}
        </>
      )}
    </div>
  )
}
