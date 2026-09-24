import type {
  DevframeConnection,
} from './index'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupDevframeConnection } from './index'

const storedConnection: DevframeConnection = {
  connectionMeta: { backend: 'static' },
  metaBaseUrl: 'http://stored.example/__connection.json',
  authToken: 'stored-token',
}
const explicitConnection: DevframeConnection = {
  connectionMeta: { backend: 'static' },
  metaBaseUrl: 'http://explicit.example/__connection.json',
  isolated: true,
}
const getItem = vi.fn<Storage['getItem']>()
const setItem = vi.fn<Storage['setItem']>()
const fetchMetadata = vi.fn<typeof fetch>()
function readGlobal(name: string): unknown {
  return Reflect.get(globalThis, name)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('parent', { window: globalThis })
  vi.stubGlobal('location', new URL('http://viewer.example/index.html'))
  vi.stubGlobal('localStorage', { getItem, setItem })
  vi.stubGlobal('fetch', fetchMetadata)
  vi.stubGlobal('__DEVFRAME_CONNECTION__', storedConnection)
  vi.stubGlobal('__DEVFRAME_CONNECTION_META__', storedConnection.connectionMeta)
  vi.stubGlobal('__DEVFRAME_CONNECTION_AUTH_TOKEN__', 'stored-token')
  getItem.mockReturnValue('stored-token')
  fetchMetadata.mockResolvedValue(Response.json({}))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isolated connection setup', () => {
  it('does not discover or persist shared credentials for an explicit isolated connection', async () => {
    expect.assertions(5)
    const connection = await setupDevframeConnection({
      connection: explicitConnection,
    })
    expect(connection).toBe(explicitConnection)
    expect(connection.authToken).toBeUndefined()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(readGlobal('__DEVFRAME_CONNECTION__')).toBe(storedConnection)
  })

  it('fetches the requested base and retains isolation when reusing its descriptor', async () => {
    expect.assertions(8)
    fetchMetadata.mockResolvedValue(
      Response.json({ backend: 'static', authToken: 'metadata-token' }),
    )
    const connection = await setupDevframeConnection({
      baseURL: 'http://requested.example/provider/',
      connection: { isolated: true },
    })
    expect(fetchMetadata).toHaveBeenCalledExactlyOnceWith(
      'http://requested.example/provider/__connection.json',
    )
    expect(connection.metaBaseUrl).toBe('http://requested.example/provider/__connection.json')
    expect(connection.authToken).toBe('metadata-token')
    expect(connection.isolated).toBe(true)
    expect(await setupDevframeConnection({ connection })).toBe(connection)
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(readGlobal('__DEVFRAME_CONNECTION__')).toBe(storedConnection)
  })

  it('accepts explicit metadata and token without reading or writing shared caches', async () => {
    expect.assertions(6)
    const connection = await setupDevframeConnection({
      connectionMeta: { backend: 'static', authToken: 'metadata-token' },
      baseURL: 'http://requested.example/',
      authToken: 'explicit-token',
      connection: { isolated: true },
    })
    expect(connection.authToken).toBe('explicit-token')
    expect(connection.metaBaseUrl).toBe('http://requested.example/__connection.json')
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(fetchMetadata).not.toHaveBeenCalled()
    expect(readGlobal('__DEVFRAME_CONNECTION_META__')).toBe(storedConnection.connectionMeta)
  })

  it.each([{}, { connection: { isolated: false } }])(
    'retains default cache discovery with %j',
    async (options) => {
      expect.assertions(5)
      const connection = await setupDevframeConnection({
        baseURL: 'http://ignored.example/',
        ...options,
      })
      expect(connection).toBe(storedConnection)
      expect(getItem).toHaveBeenCalled()
      expect(fetchMetadata).not.toHaveBeenCalled()
      expect(setItem).toHaveBeenCalledExactlyOnceWith(
        '__DEVFRAME_CONNECTION_AUTH_TOKEN__',
        'stored-token',
      )
      expect(readGlobal('__DEVFRAME_CONNECTION__')).toEqual(storedConnection)
    },
  )

  it('ignores accessible-parent caches while retaining fetched metadata resolution', async () => {
    expect.assertions(5)
    vi.stubGlobal('__DEVFRAME_CONNECTION__', undefined)
    vi.stubGlobal('__DEVFRAME_CONNECTION_META__', undefined)
    vi.stubGlobal('__DEVFRAME_CONNECTION_AUTH_TOKEN__', undefined)
    const parentWindow = {
      __DEVFRAME_CONNECTION__: storedConnection,
      __DEVFRAME_CONNECTION_AUTH_TOKEN__: 'parent-token',
    }
    vi.stubGlobal('parent', { window: parentWindow })
    fetchMetadata.mockResolvedValue(Response.json({ backend: 'static', baseUrl: './nested/__connection.json' }))
    const connection = await setupDevframeConnection({
      baseURL: 'http://requested.example/',
      connection: { isolated: true },
    })
    expect(connection.metaBaseUrl).toBe('http://requested.example/nested/__connection.json')
    expect(connection.authToken).toBeUndefined()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(parentWindow.__DEVFRAME_CONNECTION__).toBe(storedConnection)
  })
})
