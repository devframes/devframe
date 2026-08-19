'use client'

import type { FileStatusCode } from '../../../index'
import type { DiffChangeType, DiffFileChange } from './parse-patch'
import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { FileIcon } from '../ui/file-icon'
import { Icon } from '../ui/icon'
import { ScrollArea } from '../ui/scroll-area'
import { Skeleton } from '../ui/skeleton'
import { StatusMark } from '../ui/status-mark'
import { buildFileModel } from './build-model'
import { DiffFile } from './diff-file'
import { parseUnifiedPatch } from './parse-patch'

/** How the changed files are laid out. */
type DiffLayout = 'flat' | 'collapsible'

export interface DiffPatchViewProps {
  /** Raw unified/git patch text; `null` while unavailable. */
  patch: string | null
  loading: boolean
  /** True when the patch was clipped server-side (a size cap). */
  truncated: boolean
  /** Set `false` to render inline when a scrolling parent already wraps it. */
  scroll?: boolean
  /**
   * `flat` lists every file's diff; `collapsible` puts each behind a disclosure
   * header (a scannable list that expands on demand). Defaults to `flat`.
   */
  layout?: DiffLayout
}

/** Map a parsed file's change type to a git status code (for the status mark). */
function changeTypeStatus(type: DiffChangeType): FileStatusCode {
  switch (type) {
    case 'new':
      return 'added'
    case 'deleted':
      return 'deleted'
    case 'rename-pure':
    case 'rename-changed':
      return 'renamed'
    default:
      return 'modified'
  }
}

/**
 * A single file's diff behind a clickable disclosure header (filename, change
 * icon and +/- counts). The diff body mounts only while expanded, so a
 * many-file commit stays a scannable list — and does no highlight work — until
 * you open a file.
 */
function DiffFileSection({ file, defaultOpen }: { file: DiffFileChange, defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const model = useMemo(() => buildFileModel(file), [file])
  const label = file.prevName ? `${file.prevName} → ${file.name}` : file.name

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="hover:bg-active bg-secondary flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-xs transition-colors"
      >
        <Icon name="i-ph-caret-right" className={cn('color-faint size-3 transition-transform', open && 'rotate-90')} />
        <StatusMark code={changeTypeStatus(file.type)} />
        <FileIcon path={file.name} className="size-3.5" />
        <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
        {file.hunks.length > 0
          ? (
              <span className="shrink-0 tabular-nums">
                <span className="text-success">{`+${file.additions}`}</span>
                {' '}
                <span className="text-error">{`−${file.deletions}`}</span>
              </span>
            )
          : file.type.startsWith('rename')
            ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">renamed</Badge>
            : <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">bin</Badge>}
      </button>
      {open && <DiffFile model={model} />}
    </div>
  )
}

/** A file's diff rendered inline (flat layout), with its filename header. */
function DiffFileBlock({ file }: { file: DiffFileChange }) {
  const model = useMemo(() => buildFileModel(file), [file])
  const label = file.prevName ? `${file.prevName} → ${file.name}` : file.name
  return (
    <div>
      <div className="bg-secondary flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-xs">
        <StatusMark code={changeTypeStatus(file.type)} />
        <FileIcon path={file.name} className="size-3.5" />
        <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
        <span className="shrink-0 tabular-nums">
          <span className="text-success">{`+${file.additions}`}</span>
          {' '}
          <span className="text-error">{`−${file.deletions}`}</span>
        </span>
      </div>
      <DiffFile model={model} />
    </div>
  )
}

/**
 * Render a unified git patch with in-house diff rendering: the patch is parsed
 * client-side and each file's changed lines are syntax-highlighted through the
 * shared `@devframes/service-shiki` service (with intra-line word emphasis), so
 * the client ships no highlighter of its own. Set `scroll={false}` to render
 * inline; use `layout="collapsible"` for an expandable per-file list.
 */
export function DiffPatchView({ patch, loading, truncated, scroll = true, layout = 'flat' }: DiffPatchViewProps) {
  const files = useMemo(() => (patch ? parseUnifiedPatch(patch) : []), [patch])

  if (loading)
    return <Skeleton className="h-40 w-full" />
  if (!patch || files.length === 0)
    return <p className="color-muted p-3 text-sm">No textual diff available (binary or unchanged).</p>

  if (layout === 'collapsible') {
    return (
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-base">
        {files.map((file, i) => (
          <DiffFileSection key={file.name || i} file={file} defaultOpen={files.length === 1} />
        ))}
        {truncated && <p className="text-warning px-3 py-1 text-xs">Patch truncated.</p>}
      </div>
    )
  }

  const body = (
    <>
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-base">
        {files.map((file, i) => (
          <DiffFileBlock key={file.name || i} file={file} />
        ))}
      </div>
      {truncated && <p className="text-warning px-3 py-1 text-xs">Patch truncated.</p>}
    </>
  )
  if (!scroll)
    return <div>{body}</div>
  return <ScrollArea className="h-72 w-full">{body}</ScrollArea>
}
