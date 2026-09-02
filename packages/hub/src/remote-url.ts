import type { RemoteConnectionInfo } from './types'
import { REMOTE_CONNECTION_KEY } from 'devframe/constants'

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function setRemoteConnectionParam(value: string, param: string): string {
  const parts = value ? value.split('&') : []
  const existingIdx = parts.findIndex(part => part.split('=')[0] === REMOTE_CONNECTION_KEY)
  if (existingIdx >= 0)
    parts[existingIdx] = param
  else
    parts.push(param)
  return parts.join('&')
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
      const query = setRemoteConnectionParam(rawHash.slice(routeQueryIdx + 1), param)
      return `${beforeHash}#${route}${query}`
    }

    return `${beforeHash}#${setRemoteConnectionParam(rawHash, param)}`
  }

  const hashIdx = baseUrl.indexOf('#')
  const hash = hashIdx === -1 ? '' : baseUrl.slice(hashIdx)
  const beforeHash = hashIdx === -1 ? baseUrl : baseUrl.slice(0, hashIdx)
  const separator = beforeHash.includes('?') ? '&' : '?'
  return `${beforeHash}${separator}${param}${hash}`
}

function stripParamList(value: string): [value: string, changed: boolean] {
  const parts = value.split('&')
  const filtered = parts.filter(part => part.split('=')[0] !== REMOTE_CONNECTION_KEY)
  return [filtered.join('&'), filtered.length !== parts.length]
}

/** Strip the descriptor from a URL fragment, preserving its route/query split. */
function stripHashParams(hash: string): [hash: string, changed: boolean] {
  const routeQueryIdx = hash.indexOf('?')
  if (routeQueryIdx === -1)
    return stripParamList(hash)
  const route = hash.slice(0, routeQueryIdx)
  const [query, changed] = stripParamList(hash.slice(routeQueryIdx + 1))
  if (!changed)
    return [hash, false]
  return [query ? `${route}?${query}` : route, true]
}

/** Strip the descriptor from a URL query string (the part before any fragment). */
function stripQueryParams(beforeHash: string): [beforeHash: string, changed: boolean] {
  const queryIdx = beforeHash.indexOf('?')
  if (queryIdx === -1)
    return [beforeHash, false]
  const path = beforeHash.slice(0, queryIdx)
  const [query, changed] = stripParamList(beforeHash.slice(queryIdx + 1))
  if (!changed)
    return [beforeHash, false]
  return [query ? `${path}?${query}` : path, true]
}

/** Remove the remote connection descriptor from a URL before displaying or copying it. */
export function stripRemoteConnectionFromUrl(input: string): string {
  const hashIdx = input.indexOf('#')
  const rawHash = hashIdx === -1 ? undefined : input.slice(hashIdx + 1)
  const rawBeforeHash = hashIdx === -1 ? input : input.slice(0, hashIdx)

  const [hash, hashChanged] = rawHash === undefined ? [undefined, false] as const : stripHashParams(rawHash)
  const [beforeHash, queryChanged] = stripQueryParams(rawBeforeHash)

  if (!hashChanged && !queryChanged)
    return input
  return hash ? `${beforeHash}#${hash}` : beforeHash
}
