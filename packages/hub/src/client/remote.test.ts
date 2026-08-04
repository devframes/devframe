import type { DevframeConnection } from 'devframe/client'
import { describe, expect, it } from 'vitest'
import { buildRemoteConnectionUrl } from '../remote-url'
import {
  buildRemoteDevframeUrl,
  parseRemoteConnection,
  stripRemoteConnectionFromUrl,
} from './remote'

const connection: DevframeConnection = {
  connectionMeta: { backend: 'websocket', websocket: { path: '__devframe_ws' } },
  metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
  authToken: 'secret',
}

describe('remote connection URLs', () => {
  it('builds a descriptor from an existing connection', () => {
    const url = buildRemoteDevframeUrl('https://viewer.example/app', connection)
    expect(parseRemoteConnection(url)).toEqual({
      v: 1,
      backend: 'websocket',
      websocket: 'ws://localhost:5173/__devtools/__devframe_ws',
      authToken: 'secret',
      origin: 'http://localhost:5173',
    })
  })

  it('preserves hash routes and replaces an existing descriptor', () => {
    const first = buildRemoteDevframeUrl('https://viewer.example/#/inspect?tab=state', connection)
    const second = buildRemoteDevframeUrl(first, { ...connection, authToken: 'new-secret' })
    expect(second.match(/devframe-remote-connection/g)).toHaveLength(1)
    expect(second).toContain('#/inspect?tab=state&')
    expect(parseRemoteConnection(second)?.authToken).toBe('new-secret')
  })

  it('parses descriptors produced by query-based remote docks', () => {
    const url = buildRemoteConnectionUrl(
      'https://viewer.example/app?tab=one#section',
      {
        v: 1,
        backend: 'websocket',
        websocket: 'ws://localhost:5173/__devtools/__devframe_ws',
        authToken: 'secret',
        origin: 'http://localhost:5173',
      },
      'query',
    )
    expect(url).toContain('?tab=one&devframe-remote-connection=')
    expect(url.endsWith('#section')).toBe(true)
    expect(parseRemoteConnection(url)?.authToken).toBe('secret')
  })

  it('returns the original URL for untrusted or static connections', () => {
    expect(buildRemoteDevframeUrl('/viewer', { ...connection, authToken: undefined })).toBe('/viewer')
    expect(buildRemoteDevframeUrl('/viewer', {
      ...connection,
      connectionMeta: { backend: 'static' },
    })).toBe('/viewer')
  })

  it('strips descriptors from query, fragment, and hash-route query forms', () => {
    const url = buildRemoteDevframeUrl('https://viewer.example/#/inspect?tab=state', connection)
    expect(stripRemoteConnectionFromUrl(url)).toBe('https://viewer.example/#/inspect?tab=state')
    const section = buildRemoteDevframeUrl('https://viewer.example/#section', connection)
    expect(stripRemoteConnectionFromUrl(section)).toBe('https://viewer.example/#section')
    const query = buildRemoteConnectionUrl('https://viewer.example/?tab=state#section', {
      v: 1,
      backend: 'websocket',
      websocket: 'ws://localhost:5173/__devtools/__devframe_ws',
      authToken: 'secret',
      origin: 'http://localhost:5173',
    }, 'query')
    expect(stripRemoteConnectionFromUrl(query)).toBe('https://viewer.example/?tab=state#section')
  })

  it('preserves the original encoding of hash-route parameters', () => {
    expect(stripRemoteConnectionFromUrl(
      'https://viewer.example/#/inspect?tab=a%20b&devframe-remote-connection=descriptor',
    )).toBe('https://viewer.example/#/inspect?tab=a%20b')
  })
})
