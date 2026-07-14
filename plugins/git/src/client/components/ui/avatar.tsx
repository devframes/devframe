'use client'

import type * as React from 'react'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'

// A commit author avatar. We try to resolve a real portrait from the author's
// identity — a GitHub avatar for `noreply` commit emails, otherwise Gravatar —
// and fall back to a deterministic initials chip when there's no image (or no
// network). The chip is always rendered underneath, so the image simply paints
// over it once it loads and reappears on error.

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

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

// `[<n>+]<user>@users.noreply.github.com` → the GitHub username.
const GITHUB_NOREPLY = /^(?:\d+\+)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)@users\.noreply\.github\.com$/i

/**
 * Resolve an avatar image URL for a commit email. GitHub noreply addresses map
 * straight to the user's GitHub avatar; everything else resolves via Gravatar
 * (`d=404` so unregistered emails fail the request and fall back to initials).
 * Returns `null` when no email or no crypto (insecure context) is available.
 */
async function resolveAvatarUrl(email: string, size: number): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized || !normalized.includes('@'))
    return null

  const github = normalized.match(GITHUB_NOREPLY)
  if (github)
    return `https://github.com/${github[1]}.png?size=${size}`

  if (!globalThis.crypto?.subtle)
    return null
  const hash = await sha256Hex(normalized)
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=404`
}

export function Avatar({
  name,
  email,
  size = 64,
  className,
  ...props
}: { name: string, email?: string, size?: number } & React.ComponentProps<'span'>) {
  const key = (email || name || '?').toLowerCase()
  const color = AVATAR_COLORS[hashString(key) % AVATAR_COLORS.length]
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setSrc(null)
    setFailed(false)
    resolveAvatarUrl(email ?? '', size)
      .then(url => alive && setSrc(url))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [email, size])

  return (
    <span
      className={cn(
        'relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-white select-none',
        className,
      )}
      style={{ backgroundColor: color }}
      title={name}
      {...props}
    >
      {initialsOf(name, email)}
      {src && !failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full rounded-full object-cover"
        />
      )}
    </span>
  )
}
