import type { ConnectionMeta } from 'devframe/types'
import { DEVFRAME_CONNECTION_KEY } from 'devframe/constants'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDevframeConnection, setupDevframeConnection } from './connection'
import { getDevframeRpcClient } from './rpc'

const CONNECTION_META_KEY = '__DEVFRAME_CONNECTION_META__'
const CONNECTION_AUTH_TOKEN_KEY = '__DEVFRAME_CONNECTION_AUTH_TOKEN__'

const connectionMeta: ConnectionMeta = {
  backend: 'websocket',
  websocket: 7812,
}

afterEach(() => {
  delete (globalThis as any)[DEVFRAME_CONNECTION_KEY]
  delete (globalThis as any)[CONNECTION_META_KEY]
  delete (globalThis as any)[CONNECTION_AUTH_TOKEN_KEY]
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('setupDevframeConnection', () => {
  it('uses an explicit connection without fetching metadata', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const explicit = {
      connectionMeta,
      metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
      authToken: 'trusted-token',
    }

    await expect(setupDevframeConnection({
      connection: explicit,
    })).resolves.toBe(explicit)
    expect(fetch).not.toHaveBeenCalled()
    expect(getDevframeConnection()).toEqual(explicit)
  })

  it('exposes the complete connection on the RPC client', async () => {
    const connection = {
      connectionMeta: {
        backend: 'static' as const,
      },
      metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    }))

    const rpc = await getDevframeRpcClient({
      connection,
      otpParam: false,
    })

    expect(rpc.connection).toBe(connection)
    expect(rpc.connectionMeta).toBe(connection.connectionMeta)

    await rpc.requestTrustWithToken('updated-token')

    expect(rpc.connection).toEqual({
      ...connection,
      authToken: 'updated-token',
    })
  })

  it('prefers the explicit connection token over an older stored token', async () => {
    ;(globalThis as any)[CONNECTION_AUTH_TOKEN_KEY] = 'older-token'
    const explicit = {
      connectionMeta,
      metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
      authToken: 'current-token',
    }

    await expect(setupDevframeConnection({
      connection: explicit,
    })).resolves.toBe(explicit)
  })

  it('refreshes a prepared connection from shared auth storage', () => {
    ;(globalThis as any)[DEVFRAME_CONNECTION_KEY] = {
      connectionMeta,
      metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
      authToken: 'stale-token',
    }
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('current-token'),
    })

    expect(getDevframeConnection()?.authToken).toBe('current-token')
  })

  it('uses a token embedded in explicit connection metadata', async () => {
    ;(globalThis as any)[CONNECTION_AUTH_TOKEN_KEY] = 'older-token'

    await expect(setupDevframeConnection({
      baseURL: '/__foo/',
      connectionMeta: {
        ...connectionMeta,
        authToken: 'hub-token',
      },
    })).resolves.toMatchObject({
      connectionMeta: {
        ...connectionMeta,
        authToken: 'hub-token',
      },
      metaBaseUrl: '/__foo/__connection.json',
      authToken: 'hub-token',
    })
  })

  it('uses a token embedded in fetched connection metadata', async () => {
    ;(globalThis as any)[CONNECTION_AUTH_TOKEN_KEY] = 'older-token'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ...connectionMeta,
        authToken: 'hub-token',
      }),
      url: 'http://localhost:5173/__devtools/__connection.json',
    }))

    await expect(setupDevframeConnection()).resolves.toMatchObject({
      authToken: 'hub-token',
    })
  })

  it('loads metadata from fallback bases and records its response URL', async () => {
    vi.stubGlobal('location', {
      href: 'http://app.example.com/',
    })
    const fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        url: 'http://app.example.com/__devtools/__connection.json',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(connectionMeta),
        url: 'http://localhost:5173/__devtools/__connection.json',
      })
    vi.stubGlobal('fetch', fetch)

    const connection = await setupDevframeConnection({
      baseURL: [
        '/__devtools/',
        'http://localhost:5173/__devtools/',
      ],
    })

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/__devtools/__connection.json',
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:5173/__devtools/__connection.json',
    )
    expect(connection).toEqual({
      connectionMeta,
      metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
      authToken: undefined,
    })
    expect(getDevframeConnection()).toEqual(connection)
  })

  it('normalizes the legacy metadata and auth globals', () => {
    ;(globalThis as any)[CONNECTION_META_KEY] = {
      ...connectionMeta,
      baseUrl: 'http://localhost:5173/__devtools/__connection.json',
    }
    ;(globalThis as any)[CONNECTION_AUTH_TOKEN_KEY] = 'trusted-token'

    expect(getDevframeConnection()).toEqual({
      connectionMeta: {
        ...connectionMeta,
        baseUrl: 'http://localhost:5173/__devtools/__connection.json',
      },
      metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
      authToken: 'trusted-token',
    })
  })

  it('reports every failed metadata base', async () => {
    vi.stubGlobal('location', {
      href: 'http://app.example.com/',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }))

    const promise = setupDevframeConnection({
      baseURL: ['/first/', '/second/'],
    })

    await expect(promise).rejects.toMatchObject({
      message: 'Failed to get connection meta from /first/, /second/',
      cause: [
        expect.objectContaining({
          message: 'Failed to fetch connection meta from http://app.example.com/first/__connection.json: 404',
        }),
        expect.objectContaining({
          message: 'Failed to fetch connection meta from http://app.example.com/second/__connection.json: 404',
        }),
      ],
    })
  })
})
