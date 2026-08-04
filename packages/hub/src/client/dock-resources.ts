import type { DevframeConnection } from 'devframe/client'
import type { DevframeDockEntryIcon } from '../types'

const URL_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i

function resolveResourceUrl(value: string, connection: DevframeConnection): string {
  const url = value.trim()
  if (!url || URL_SCHEME_RE.test(url) || url.startsWith('//'))
    return url

  if (!url.startsWith('/') && !url.startsWith('./') && !url.startsWith('../'))
    return url

  try {
    return new URL(url, connection.metaBaseUrl).href
  }
  catch {
    return url
  }
}

function resolveIconUrl(value: string, connection: DevframeConnection): string {
  const url = value.trim()
  if (!url || URL_SCHEME_RE.test(url) || url.startsWith('//'))
    return url

  // Preserve symbolic icon names while resolving URL-like filenames and paths.
  if (!url.includes('/') && !url.includes('.'))
    return url

  try {
    return new URL(url, connection.metaBaseUrl).href
  }
  catch {
    return url
  }
}

/**
 * Resolve a dock iframe URL relative to the Devframe server that provided the
 * dock entry. This keeps root-relative and dot-relative paths on the host
 * server when an external viewer renders the hub.
 */
export function resolveDockUrl(url: string, connection: DevframeConnection): string {
  const resolved = resolveResourceUrl(url, connection)
  if (resolved !== url.trim())
    return resolved

  const value = url.trim()
  if (!value || URL_SCHEME_RE.test(value) || value.startsWith('//'))
    return /^localhost:\d/i.test(value) ? `http://${value}` : value

  try {
    return new URL(`http://${value}`).href
  }
  catch {
    return value
  }
}

/** Resolve URL-backed dock icons while preserving Iconify names and data URLs. */
export function resolveDockIcon(
  icon: DevframeDockEntryIcon,
  connection: DevframeConnection,
): DevframeDockEntryIcon {
  if (typeof icon === 'string')
    return resolveIconUrl(icon, connection)

  return {
    light: resolveIconUrl(icon.light, connection),
    dark: resolveIconUrl(icon.dark, connection),
  }
}
