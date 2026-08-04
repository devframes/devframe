import type { RemoteConnectionInfo } from './types'
import { REMOTE_CONNECTION_KEY } from 'devframe/constants'

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Encode a remote connection descriptor into an external viewer URL. */
export function buildRemoteConnectionUrl(
  baseUrl: string,
  payload: RemoteConnectionInfo,
  transport: 'fragment' | 'query' = 'fragment',
): string {
  const encoded = base64UrlEncode(JSON.stringify(payload))
  const param = `${REMOTE_CONNECTION_KEY}=${encoded}`

  if (transport === 'fragment') {
    const hashIdx = baseUrl.indexOf('#')
    if (hashIdx === -1)
      return `${baseUrl}#${param}`

    const beforeHash = baseUrl.slice(0, hashIdx)
    const rawHash = baseUrl.slice(hashIdx + 1)
    if (!rawHash)
      return `${beforeHash}#${param}`

    const routeQueryIdx = rawHash.indexOf('?')
    if (routeQueryIdx !== -1) {
      const route = rawHash.slice(0, routeQueryIdx + 1)
      const params = new URLSearchParams(rawHash.slice(routeQueryIdx + 1))
      params.set(REMOTE_CONNECTION_KEY, encoded)
      return `${beforeHash}#${route}${params}`
    }

    const parts = rawHash.split('&')
    const existingIdx = parts.findIndex(part => part.split('=')[0] === REMOTE_CONNECTION_KEY)
    if (existingIdx >= 0)
      parts[existingIdx] = param
    else
      parts.push(param)
    return `${beforeHash}#${parts.join('&')}`
  }

  const hashIdx = baseUrl.indexOf('#')
  const hash = hashIdx === -1 ? '' : baseUrl.slice(hashIdx)
  const beforeHash = hashIdx === -1 ? baseUrl : baseUrl.slice(0, hashIdx)
  const separator = beforeHash.includes('?') ? '&' : '?'
  return `${beforeHash}${separator}${param}${hash}`
}

/** Remove the remote connection descriptor from a URL before displaying or copying it. */
export function stripRemoteConnectionFromUrl(input: string): string {
  function stripParamList(value: string): [value: string, changed: boolean] {
    const parts = value.split('&')
    const filtered = parts.filter(part => part.split('=')[0] !== REMOTE_CONNECTION_KEY)
    return [filtered.join('&'), filtered.length !== parts.length]
  }

  const hashIdx = input.indexOf('#')
  let beforeHash = hashIdx === -1 ? input : input.slice(0, hashIdx)
  let hash = hashIdx === -1 ? undefined : input.slice(hashIdx + 1)
  let changed = false

  if (hash !== undefined) {
    const routeQueryIdx = hash.indexOf('?')
    if (routeQueryIdx === -1) {
      const [nextHash, didChange] = stripParamList(hash)
      hash = nextHash
      changed ||= didChange
    }
    else {
      const route = hash.slice(0, routeQueryIdx)
      const [query, didChange] = stripParamList(hash.slice(routeQueryIdx + 1))
      if (didChange) {
        hash = query ? `${route}?${query}` : route
        changed = true
      }
    }
  }

  const queryIdx = beforeHash.indexOf('?')
  if (queryIdx !== -1) {
    const path = beforeHash.slice(0, queryIdx)
    const [query, didChange] = stripParamList(beforeHash.slice(queryIdx + 1))
    if (didChange) {
      beforeHash = query ? `${path}?${query}` : path
      changed = true
    }
  }

  if (!changed)
    return input
  return hash ? `${beforeHash}#${hash}` : beforeHash
}
