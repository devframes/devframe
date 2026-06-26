import type { WsUrlLocation } from './rpc-ws'
import { describe, expect, it } from 'vitest'
import { resolveWsUrl } from './rpc-ws'

const httpLoc: WsUrlLocation = {
  protocol: 'http:',
  host: 'localhost:5173',
  hostname: 'localhost',
  href: 'http://localhost:5173/__foo/index.html',
}

const httpsProxyLoc: WsUrlLocation = {
  // A reverse proxy serves the SPA over HTTPS on a rewritten host/subpath.
  protocol: 'https:',
  host: 'devtools.example.com',
  hostname: 'devtools.example.com',
  href: 'https://devtools.example.com/app/__foo/index.html',
}

describe('resolveWsUrl', () => {
  it('resolves a relative path against the meta base, same-origin', () => {
    const url = resolveWsUrl(
      { path: '__devframe_ws' },
      'http://localhost:5173/__foo/__connection.json',
      httpLoc,
    )
    expect(url).toBe('ws://localhost:5173/__foo/__devframe_ws')
  })

  it('follows the page origin through a proxy (host + subpath + tls)', () => {
    // The server has no idea about the proxy's host — the client reuses its own.
    const url = resolveWsUrl(
      { path: '__devframe_ws' },
      'https://devtools.example.com/app/__foo/__connection.json',
      httpsProxyLoc,
    )
    expect(url).toBe('wss://devtools.example.com/app/__foo/__devframe_ws')
  })

  it('roots an explicit-port endpoint at the page hostname (side-car)', () => {
    const url = resolveWsUrl(
      { port: 9777, path: '/__devframe_ws' },
      'http://localhost:5173/__hub/__connection.json',
      httpLoc,
    )
    expect(url).toBe('ws://localhost:9777/__devframe_ws')
  })

  it('honors an explicit host override', () => {
    const url = resolveWsUrl(
      { host: 'inner:1234', path: '/__devframe_ws' },
      'http://localhost:5173/__connection.json',
      httpLoc,
    )
    expect(url).toBe('ws://inner:1234/__devframe_ws')
  })

  it('keeps the legacy numeric-port form (page hostname)', () => {
    expect(resolveWsUrl(9999, './', httpLoc)).toBe('ws://localhost:9999')
    expect(resolveWsUrl(9999, './', httpsProxyLoc)).toBe('wss://devtools.example.com:9999')
  })

  it('uses a full ws/wss URL verbatim', () => {
    expect(resolveWsUrl('wss://example.com/socket', './', httpLoc)).toBe('wss://example.com/socket')
  })

  it('swaps protocol on an http(s) URL string', () => {
    expect(resolveWsUrl('http://example.com:8080/x', './', httpLoc)).toBe('ws://example.com:8080/x')
    expect(resolveWsUrl('https://example.com/x', './', httpLoc)).toBe('wss://example.com/x')
  })

  it('resolves a bare path string same-origin', () => {
    expect(resolveWsUrl('/socket', 'http://localhost:5173/__connection.json', httpLoc))
      .toBe('ws://localhost:5173/socket')
  })
})
