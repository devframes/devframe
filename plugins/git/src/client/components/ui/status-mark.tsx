import type { FileStatusCode } from '../../../index'
import { cn } from '../../lib/utils'

// A single-letter git status mark (A / M / D / R …), tinted by change kind —
// the compact status indicator shown beside a file in the changes and
// commit-detail file lists.

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

const STATUS_COLOR: Record<FileStatusCode, string> = {
  'added': 'text-success',
  'deleted': 'text-error',
  'modified': 'text-warning',
  'renamed': 'color-active',
  'copied': 'color-active',
  'type-changed': 'text-warning',
  'unmerged': 'text-error',
  'unknown': 'color-muted',
}

export function statusLabel(code: FileStatusCode): string {
  return STATUS_LABEL[code]
}

export function StatusMark({ code, className }: { code: FileStatusCode, className?: string }) {
  return (
    <span
      className={cn('w-3.5 shrink-0 text-center font-mono text-xs font-semibold', STATUS_COLOR[code], className)}
      title={code}
      aria-label={code}
    >
      {STATUS_LABEL[code]}
    </span>
  )
}
