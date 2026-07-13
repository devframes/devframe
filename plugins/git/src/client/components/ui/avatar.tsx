import type * as React from 'react'
import { cn } from '../../lib/utils'

// A deterministic, offline avatar: initials drawn on a stable background color
// derived from the author's identity. No network round-trip (keeping the
// dashboard self-contained), yet every author reads as a distinct chip — the
// same visual role the photo avatar plays in the commit hover card.

// Saturated-but-legible hues that sit well behind white text in both themes.
const AVATAR_COLORS = [
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
]

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++)
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  return Math.abs(hash)
}

/** Up to two initials from a display name (or the email local-part). */
function initialsOf(name: string, email?: string): string {
  const source = name.trim() || (email ?? '').split('@')[0] || '?'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0)
    return '?'
  if (parts.length === 1)
    return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({
  name,
  email,
  className,
  ...props
}: { name: string, email?: string } & React.ComponentProps<'span'>) {
  const key = (email || name || '?').toLowerCase()
  const color = AVATAR_COLORS[hashString(key) % AVATAR_COLORS.length]
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white select-none',
        className,
      )}
      style={{ backgroundColor: color }}
      title={name}
      {...props}
    >
      {initialsOf(name, email)}
    </span>
  )
}
