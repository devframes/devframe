import type { DevframeConnection, DevframeRpcClient, DevframeRpcClientOptions } from 'devframe/client'
import type { RemoteConnectionInfo } from '../types'
import { destr } from 'destr'
import { getDevframeRpcClient, resolveWsUrl } from 'devframe/client'
import { REMOTE_CONNECTION_KEY } from 'devframe/constants'
import { buildRemoteConnectionUrl } from '../remote-url'

export { stripRemoteConnectionFromUrl } from '../remote-url'

export type ConnectRemoteDevframeOptions = Omit<DevframeRpcClientOptions, 'connectionMeta' | 'authToken'>

function base64UrlDecode(value: string): string {
  const padLen = (4 - value.length % 4) % 4
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/**
 * Build an external viewer URL from an existing trusted Devframe connection.
 * Returns the original URL if the connection has no auth token, does not use
 * WebSockets, or has an invalid metadata URL.
 */
export function buildRemoteDevframeUrl(
  url: string,
  connection: DevframeConnection,
): string {
  if (!connection.authToken || connection.connectionMeta.backend !== 'websocket')
    return url

  let base: URL
  try {
    base = new URL(connection.metaBaseUrl)
  }
  catch {
    return url
  }

  const websocket = resolveWsUrl(connection.connectionMeta.websocket, connection.metaBaseUrl, base)
  return buildRemoteConnectionUrl(url, {
    v: 1,
    backend: 'websocket',
    websocket,
    authToken: connection.authToken,
    origin: base.origin,
  })
}

function extractKeyFromFragment(hash: string): string | null {
  if (!hash)
    return null
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const queryIdx = raw.indexOf('?')
  if (queryIdx !== -1) {
    const value = new URLSearchParams(raw.slice(queryIdx + 1)).get(REMOTE_CONNECTION_KEY)
    if (value)
      return value
  }

  for (const part of raw.split('&')) {
    const [k, v = ''] = part.split('=')
    if (k === REMOTE_CONNECTION_KEY)
      return decodeURIComponent(v)
  }
  return null
}

function extractKeyFromQuery(search: string): string | null {
  if (!search)
    return null
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    .get(REMOTE_CONNECTION_KEY)
}

/**
 * Parse a {@link RemoteConnectionInfo} descriptor from the current page's URL
 * (or a provided URL/string). Checks the URL fragment first, then the query.
 *
 * Returns `null` if no descriptor is present.
 * Throws if the descriptor is malformed or its schema version is unsupported.
 */
export function parseRemoteConnection(input?: string): RemoteConnectionInfo | null {
  const parts = resolveUrlParts(input)
  if (!parts)
    return null

  const encoded = extractKeyFromFragment(parts.hash) ?? extractKeyFromQuery(parts.search)
  if (!encoded)
    return null

  let payload: unknown
  try {
    payload = destr(base64UrlDecode(encoded), { strict: true })
  }
  catch (cause) {
    throw new Error('[@devframes/hub] Failed to decode remote connection descriptor.', { cause })
  }

  return validateConnectionDescriptor(payload)
}

/** Resolve the URL fragment/query to inspect, from an explicit input or `location`. */
function resolveUrlParts(input?: string): { hash: string, search: string } | null {
  if (input === undefined) {
    if (typeof location === 'undefined')
      return null
    return { hash: location.hash, search: location.search }
  }
  try {
    const parsed = new URL(input, 'http://_')
    return { hash: parsed.hash, search: parsed.search }
  }
  catch {
    // Treat as a raw fragment or query string.
    if (input.startsWith('#'))
      return { hash: input, search: '' }
    if (input.startsWith('?'))
      return { hash: '', search: input }
    return null
  }
}

/** Validate a decoded payload as a {@link RemoteConnectionInfo}, throwing on any mismatch. */
function validateConnectionDescriptor(payload: unknown): RemoteConnectionInfo {
  if (!payload || typeof payload !== 'object')
    throw new Error('[@devframes/hub] Remote connection descriptor must be an object.')

  const info = payload as Partial<RemoteConnectionInfo>
  if (info.v !== 1)
    throw new Error(`[@devframes/hub] Unsupported remote connection descriptor version: ${String(info.v)}`)
  if (info.backend !== 'websocket' || typeof info.websocket !== 'string' || !info.websocket)
    throw new Error('[@devframes/hub] Remote connection descriptor must carry a websocket URL.')
  if (typeof info.authToken !== 'string' || !info.authToken)
    throw new Error('[@devframes/hub] Remote connection descriptor must carry an auth token.')
  if (typeof info.origin !== 'string')
    throw new Error('[@devframes/hub] Remote connection descriptor must carry an origin.')

  return info as RemoteConnectionInfo
}

/**
 * One-liner for a hosted Devframe page: reads the connection descriptor from
 * the current URL and returns a connected {@link DevframeRpcClient}.
 *
 * Pairs with `remote: true` on a `DevframeViewIframe` registered on the node
 * side, where the hub injects the descriptor into the iframe URL.
 *
 * @throws if no descriptor is present in the URL.
 */
export async function connectRemoteDevframe(
  options: ConnectRemoteDevframeOptions = {},
): Promise<DevframeRpcClient> {
  const info = parseRemoteConnection()
  if (!info) {
    throw new Error(
      `[@devframes/hub] No remote connection descriptor found in the URL. `
      + `Open this page through a hub-registered dock with \`remote: true\`.`,
    )
  }
  return getDevframeRpcClient({
    ...options,
    connectionMeta: info,
    authToken: info.authToken,
  })
}
