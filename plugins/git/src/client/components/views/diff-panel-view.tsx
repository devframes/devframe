'use client'

import type { FileDiffMetadata, FileDiffOptions } from '@pierre/diffs'
import type { ReactNode } from 'react'
import type { GitDiff } from '../../../index'
import { parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
import { useColorScheme } from '../theme'
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

// Shiki themes for the diff renderer, chosen to sit alongside the @antfu/design
// surfaces; @pierre/diffs picks light vs. dark from `themeType`.
const DIFF_THEME = { light: 'vitesse-light', dark: 'vitesse-dark' } as const

/** Split a unified/git patch into its per-file diffs, tolerant of truncation. */
function parsePatch(patch: string) {
  try {
    return parsePatchFiles(patch).flatMap(p => p.files)
  }
  catch {
    return []
  }
}

/** Added / deleted line counts for a parsed file diff. */
function fileStats(file: FileDiffMetadata): { additions: number, deletions: number } {
  let additions = 0
  let deletions = 0
  for (const hunk of file.hunks) {
    additions += hunk.additionLines
    deletions += hunk.deletionLines
  }
  return { additions, deletions }
}

/** Phosphor icon + tint for a parsed file's change type. */
function changeTypeIcon(type: FileDiffMetadata['type']): { name: string, className: string } {
  switch (type) {
    case 'new':
      return { name: 'i-ph-file-plus-duotone', className: 'text-success' }
    case 'deleted':
      return { name: 'i-ph-file-x-duotone', className: 'text-error' }
    case 'rename-pure':
    case 'rename-changed':
      return { name: 'i-ph-file-arrow-up-duotone', className: 'color-muted' }
    default:
      return { name: 'i-ph-file-duotone', className: 'color-muted' }
  }
}

/**
 * A single file's diff behind a clickable disclosure header (filename, change
 * icon and +/- counts). The `@pierre/diffs` body mounts only while expanded, so
 * a many-file commit stays a scannable list until you open a file.
 */
function FileDiffSection({ file, options, defaultOpen }: { file: FileDiffMetadata, options: FileDiffOptions<undefined>, defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const { additions, deletions } = fileStats(file)
  const icon = changeTypeIcon(file.type)
  const label = file.prevName ? `${file.prevName} → ${file.name}` : file.name

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="hover:bg-active bg-secondary flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-xs transition-colors"
      >
        <Icon name="i-ph-caret-right" className={cn('color-faint size-3 transition-transform', open && 'rotate-90')} />
        <Icon name={icon.name} className={cn('size-3.5', icon.className)} />
        <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
        {file.hunks.length > 0
          ? (
              <span className="shrink-0 tabular-nums">
                <span className="text-success">{`+${additions}`}</span>
                {' '}
                <span className="text-error">{`−${deletions}`}</span>
              </span>
            )
          : file.type.startsWith('rename')
            ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">renamed</Badge>
            : <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">bin</Badge>}
      </button>
      {open && (
        file.hunks.length > 0
          ? <FileDiff fileDiff={file} options={options} disableWorkerPool />
          : <p className="color-muted px-3 py-2 text-xs">No textual diff (binary or metadata-only change).</p>
      )}
    </div>
  )
}

/**
 * Renders a unified git patch with `@pierre/diffs` (diffs.com) — Shiki syntax
 * highlighting, per-file headers, and a theme synced to the app. Set
 * `scroll={false}` to render inline (no inner scroll area) when the patch
 * already sits in a scrolling parent. With `collapsible`, each file sits behind
 * a disclosure header (a scannable, expandable list of the changed files).
 */
export function DiffPatchView({ patch, loading, truncated, scroll = true, collapsible = false }: { patch: string | null, loading: boolean, truncated: boolean, scroll?: boolean, collapsible?: boolean }) {
  const scheme = useColorScheme()
  const files = useMemo(() => (patch ? parsePatch(patch) : []), [patch])
  const options = useMemo<FileDiffOptions<undefined>>(() => ({
    theme: DIFF_THEME,
    themeType: scheme,
    diffStyle: 'unified',
    diffIndicators: 'classic',
    // In collapsible mode the disclosure header replaces the built-in one.
    disableFileHeader: collapsible,
  }), [scheme, collapsible])

  if (loading)
    return <Skeleton className="h-40 w-full" />
  if (!patch || files.length === 0)
    return <p className="color-muted p-3 text-sm">No textual diff available (binary or unchanged).</p>

  if (collapsible) {
    return (
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-base">
        {files.map((file, i) => (
          <FileDiffSection key={file.name || i} file={file} options={options} defaultOpen={files.length === 1} />
        ))}
        {truncated && <p className="text-warning px-3 py-1 text-xs">Patch truncated.</p>}
      </div>
    )
  }

  const body = (
    <>
      <div className="flex flex-col text-sm [&>*+*]:border-t [&>*+*]:border-base">
        {files.map((file, i) => (
          <FileDiff key={file.name || i} fileDiff={file} options={options} disableWorkerPool />
        ))}
      </div>
      {truncated && <p className="text-warning px-3 py-1 text-xs">Patch truncated.</p>}
    </>
  )
  if (!scroll)
    return <div>{body}</div>
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
              {patchSlot}
            </div>
          )}
        </>
      )}
    </div>
  )
}
