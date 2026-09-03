'use client'

import type { CSSProperties } from 'react'
import type { DiffFileModel, RenderHunk, RenderLine } from './build-model'
import type { TokenLines } from './use-diff-tokens'
import { cn } from '../../lib/utils'
import { Skeleton } from '../ui/skeleton'
import { buildSegments } from './render-segments'
import { useDiffTokens } from './use-diff-tokens'

const NUMBER_CELL = 'w-10 shrink-0 select-none px-1.5 text-right tabular-nums color-faint'

/** A line's content, split into syntax-colored segments with intra-line emphasis. */
function LineContent({ line, tokens }: { line: RenderLine, tokens: TokenLines | null }) {
  const segments = buildSegments(tokens?.[line.tokenLine], line.content, line.wordRanges)
  const changedBg = line.type === 'add' ? 'bg-success/25' : 'bg-error/25'
  return (
    <>
      {segments.map((segment, i) => (
        <span
          key={i}
          className={cn('dark:[color:var(--shiki-dark)]', segment.changed && changedBg)}
          style={segment.style as CSSProperties | undefined}
        >
          {segment.text}
        </span>
      ))}
    </>
  )
}

/** One diff row: old/new line-number gutters, the +/- marker, and the code. */
function DiffLine({ line, tokens }: { line: RenderLine, tokens: TokenLines | null }) {
  const bg = line.type === 'add' ? 'bg-success/10' : line.type === 'del' ? 'bg-error/10' : ''
  const marker = line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '
  const markerColor = line.type === 'add' ? 'text-success' : line.type === 'del' ? 'text-error' : 'color-faint'
  return (
    <div className={cn('flex', bg)}>
      <span className={NUMBER_CELL}>{line.oldNumber ?? ''}</span>
      <span className={NUMBER_CELL}>{line.newNumber ?? ''}</span>
      <span className={cn('w-4 shrink-0 select-none text-center', markerColor)}>{marker}</span>
      <code className="min-w-0 flex-1 break-all whitespace-pre-wrap pr-2">
        <LineContent line={line} tokens={tokens} />
      </code>
    </div>
  )
}

/** A hunk: its `@@` header row followed by the hunk's lines. */
function DiffHunk({ hunk, oldTokens, newTokens }: { hunk: RenderHunk, oldTokens: TokenLines | null, newTokens: TokenLines | null }) {
  return (
    <div>
      <div className="bg-secondary color-faint px-2 py-0.5">{hunk.header}</div>
      {hunk.lines.map((line, i) => (
        <DiffLine key={i} line={line} tokens={line.tokenSide === 'old' ? oldTokens : newTokens} />
      ))}
    </div>
  )
}

/**
 * Render a single file's diff: highlight its reconstructed sides through the
 * shiki service (skeleton until the tokens land) and lay out the hunks. Files
 * with no textual hunks (binary or metadata-only) show a short note; when the
 * highlight service is unavailable the diff renders plain (un-highlighted).
 */
export function DiffFile({ model }: { model: DiffFileModel }) {
  const hasHunks = model.file.hunks.length > 0
  const { oldTokens, newTokens, loading, unavailable } = useDiffTokens(model.oldText, model.newText, model.file.lang, hasHunks)

  if (!hasHunks)
    return <p className="color-muted px-3 py-2 text-xs">No textual diff (binary or metadata-only change).</p>

  if (loading && !unavailable)
    return <Skeleton className="m-2 h-20" />

  const oldT = unavailable ? null : oldTokens
  const newT = unavailable ? null : newTokens
  return (
    <div className="font-mono text-xs leading-5">
      {model.hunks.map((hunk, i) => (
        <DiffHunk key={i} hunk={hunk} oldTokens={oldT} newTokens={newT} />
      ))}
    </div>
  )
}
