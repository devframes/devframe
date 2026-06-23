'use client'

import type { ReactNode } from 'react'
import type { GitDiff } from '../../../index'
import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
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
    return 'text-primary'
  if (line.startsWith('+') && !line.startsWith('+++'))
    return 'text-success'
  if (line.startsWith('-') && !line.startsWith('---'))
    return 'text-destructive'
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---'))
    return 'text-muted-foreground font-semibold'
  return 'text-foreground'
}

/** Pure renderer for a unified patch. */
export function DiffPatchView({ patch, loading, truncated }: { patch: string | null, loading: boolean, truncated: boolean }) {
  if (loading)
    return <Skeleton className="h-40 w-full" />
  if (!patch)
    return <p className="text-muted-foreground p-3 text-sm">No textual diff available (binary or unchanged).</p>
  return (
    <ScrollArea className="h-72 w-full">
      <pre className="font-mono text-xs leading-relaxed">
        {patch.split('\n').map((line, i) => (
          <div key={i} className={cn('px-3 whitespace-pre', patchLineClass(line))}>{line || ' '}</div>
        ))}
      </pre>
      {truncated && <p className="text-warning px-3 py-1 text-xs">Patch truncated.</p>}
    </ScrollArea>
  )
}

export function DiffPanelView(props: DiffPanelViewProps) {
  const { data, loading, staged, selected, onSelectScope, onSelectFile, onRefresh, patchSlot } = props
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="bg-muted inline-flex rounded-lg p-[3px] text-sm">
          {([['Working tree', false], ['Staged', true]] as const).map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => onSelectScope(value)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1 font-medium transition-colors',
                staged === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
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
              <span className="text-destructive">
                −
                {data.totalDeletions}
              </span>
            </span>
          )}
          <Button variant="ghost" size="icon" className="size-7" onClick={onRefresh} disabled={loading} aria-label="Refresh diff">
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {!data && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      )}

      {data && !data.isRepo && (
        <p className="text-muted-foreground text-sm">The working directory is not a git repository.</p>
      )}

      {data?.isRepo && data.files.length === 0 && (
        <p className="text-muted-foreground text-sm">
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
                      selected === file.path ? 'bg-accent' : 'hover:bg-accent/50',
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
                            <span className="text-destructive">
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
              <div className="bg-muted/50 border-b px-3 py-1 font-mono text-xs">{selected}</div>
              {patchSlot}
            </div>
          )}
        </>
      )}
    </div>
  )
}
