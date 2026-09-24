import type { DevframeConnection } from './connection'
import { DEVFRAME_CONNECTION_KEY } from 'devframe/constants'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDevframeRpcClient } from './rpc'

const transport = vi.hoisted(() => ({ close: vi.fn() }))

vi.mock('devframe/rpc/transports/ws-client', () => ({
  createWsRpcChannel: () => ({ post: vi.fn(), on: vi.fn(), close: transport.close }),
}))
vi.mock('devframe/rpc/client', () => ({
  createRpcClient: () => ({
    $callEvent: vi.fn(),
    $call: async (method: string, input: { code?: string }) => {
      if (method === 'anonymous:devframe:auth:exchange')
        return { authToken: `issued-${input.code}` }
      if (method === 'anonymous:devframe:auth')
        return { isTrusted: true }
      return {}
    },
  }),
}))

const sharedConnection: DevframeConnection = {
  connectionMeta: { backend: 'websocket', websocket: { path: '__ws' } },
  metaBaseUrl: 'http://shared.example/__connection.json',
  authToken: 'shared-token',
}
const storage = { getItem: vi.fn(), setItem: vi.fn() }
const closeChannel = vi.fn()
const channel = vi.fn(class {
  postMessage = vi.fn()
  close = closeChannel
})
const options = { isolateConnection: true, otpParam: false, simpleAuth: false, webmcp: false } as const

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('location', new URL('http://viewer.example/'))
  vi.stubGlobal('navigator', { userAgent: 'test' })
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('BroadcastChannel', channel)
  vi.stubGlobal(DEVFRAME_CONNECTION_KEY, sharedConnection)
  vi.stubGlobal('__DEVFRAME_CONNECTION_AUTH_TOKEN__', 'shared-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('keeps independent authentication and reconnection local while closing transports', async () => {
  expect.assertions(11)
  const first = await getDevframeRpcClient({
    ...options,
    connection: { ...sharedConnection, metaBaseUrl: 'http://first.example/__connection.json', authToken: 'first-token' },
  })
  const second = await getDevframeRpcClient({
    ...options,
    connection: { ...sharedConnection, metaBaseUrl: 'http://second.example/__connection.json', authToken: 'second-token' },
  })
  try {
    expect(await first.requestTrustWithCode('first-code')).toBe(true)
    expect(first.connection.authToken).toBe('issued-first-code')
    expect(second.connection.authToken).toBe('second-token')
    const recreated = await getDevframeRpcClient({ ...options, connection: second.connection })
    try {
      expect(recreated.connection.metaBaseUrl).toBe('http://second.example/__connection.json')
      expect(recreated.connection.authToken).toBe('second-token')
      expect(await recreated.requestTrustWithToken('second-updated')).toBe(true)
      expect(first.connection.authToken).toBe('issued-first-code')
      expect(Reflect.get(globalThis, '__DEVFRAME_CONNECTION_AUTH_TOKEN__')).toBe('shared-token')
      expect(storage.setItem).not.toHaveBeenCalled()
      expect(channel).not.toHaveBeenCalled()
    }
    finally {
      recreated.close?.()
    }
  }
  finally {
    first.close?.()
    second.close?.()
  }
  expect(transport.close).toHaveBeenCalledTimes(3)
})

it.each([{}, { isolateConnection: false }])('preserves shared OTP persistence and broadcasts with %j', async (settings) => {
  expect.assertions(6)
  const rpcClient = await getDevframeRpcClient({
    ...options,
    isolateConnection: undefined,
    ...settings,
    connection: sharedConnection,
  })
  try {
    expect(await rpcClient.requestTrustWithCode('shared-code')).toBe(true)
    expect(rpcClient.connection.authToken).toBe('issued-shared-code')
    expect(storage.setItem).toHaveBeenLastCalledWith('__DEVFRAME_CONNECTION_AUTH_TOKEN__', 'issued-shared-code')
    expect(channel).toHaveBeenCalledExactlyOnceWith('devframe-auth')
    expect(channel.mock.results[0]?.value.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'auth-update', authToken: 'issued-shared-code' })
  }
  finally {
    rpcClient.close?.()
  }
  expect(closeChannel).toHaveBeenCalledOnce()
})
