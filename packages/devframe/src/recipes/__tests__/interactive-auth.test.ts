import type { DevframeHost, DevframeNodeContext, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from 'devframe/types'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'get-port-please'
import { describe, expect, it } from 'vitest'
import { serveTestContext } from '../../../../../tests/helpers/serve-test-context'
import { getTempAuthCode } from '../../node/auth/state'
import { createHostContext } from '../../node/context'
import { getInternalContext } from '../../node/hub-internals/context'
import { createInteractiveAuth } from '../interactive-auth'

function makeHost(storageDir: string): DevframeHost {
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost',
    getStorageDir: () => storageDir,
  }
}

async function createTestContext(): Promise<DevframeNodeContext> {
  const storageDir = mkdtempSync(join(tmpdir(), 'devframe-interactive-auth-'))
  return createHostContext({ cwd: storageDir, mode: 'dev', host: makeHost(storageDir) })
}

/** Starts a fully-authenticated server with one trusted-only probe method. */
async function startAuthenticatedServer(
  banners: { code: string, url: string }[] = [],
  preTrust = false,
  onTrusted?: (info: { authToken: string }) => void,
) {
  const context = await createTestContext()
  context.rpc.register({
    name: 'test:trusted-only',
    type: 'query',
    handler: () => 'ok',
  })
  const auth = createInteractiveAuth(context, {
    banner: info => banners.push(info),
    onTrusted,
  })

  const host = '127.0.0.1'
  const port = await getPort({ port: 0, host })
  const server = await serveTestContext({
    context,
    host,
    port,
    auth,
    onPeerConnect: preTrust
      ? (_peer, session) => {
          session.meta.isTrusted = true
        }
      : undefined,
  })
  return { context, auth, server, host, port }
}

function connectClient(host: string, port: number, authToken?: string) {
  return createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
    {} as DevframeRpcClientFunctions,
    { channel: createWsRpcChannel({ url: `ws://${host}:${port}`, authToken }) },
  )
}

describe('recipes/interactive-auth', () => {
  it('createInteractiveAuth() returns a layer with the expected shape', async () => {
    const context = await createTestContext()
    const auth = createInteractiveAuth(context)

    expect(auth.rpcFunctions.map(fn => fn.name)).toEqual([
      'anonymous:devframe:auth',
      'anonymous:devframe:auth:exchange',
      'devframe:auth:revoke',
    ])
    expect(typeof auth.authorize).toBe('function')
    expect(typeof auth.onConnect).toBe('function')
    expect(typeof auth.printBanner).toBe('function')
  })

  it('authorize() allows anonymous methods and requires trust for everything else', async () => {
    const context = await createTestContext()
    const auth = createInteractiveAuth(context)
    const session = { meta: {} } as any

    expect(auth.authorize('anonymous:devframe:auth', session)).toBe(true)
    expect(auth.authorize('anonymous:devframe:auth:exchange', session)).toBe(true)
    expect(auth.authorize('some-plugin:do-something', session)).toBe(false)

    session.meta.isTrusted = true
    expect(auth.authorize('some-plugin:do-something', session)).toBe(true)
  })

  it('printBanner() only prints once per code', async () => {
    const context = await createTestContext()
    const seen: { code: string, url: string }[] = []
    const auth = createInteractiveAuth(context, { banner: info => seen.push(info) })

    auth.printBanner()
    auth.printBanner()
    expect(seen).toHaveLength(1)
  })

  it('round-trips: untrusted connect -> exchange -> trusted -> reconnect with the returned bearer, no new code', async () => {
    const { server, host, port } = await startAuthenticatedServer()

    try {
      // An untrusted connection can only reach `anonymous:`-prefixed methods.
      const untrusted = connectClient(host, port)
      await expect(untrusted.$call('test:trusted-only' as any)).rejects.toThrow()

      const handshake = await untrusted.$call('anonymous:devframe:auth', { authToken: '', ua: 'test', origin: 'http://localhost' })
      expect(handshake).toEqual({ isTrusted: false })

      const code = getTempAuthCode()
      const { authToken } = await untrusted.$call('anonymous:devframe:auth:exchange', { code, ua: 'test', origin: 'http://localhost' })
      expect(authToken).toBeTruthy()
      const codeAfterExchange = getTempAuthCode()
      expect(codeAfterExchange).not.toBe(code)

      // Now trusted — the probe method succeeds on the same connection.
      await expect(untrusted.$call('test:trusted-only' as any)).resolves.toBe('ok')
      untrusted.$close()

      // Reconnect with the returned bearer — trusted without a new code.
      const returning = connectClient(host, port, authToken!)
      const reauth = await returning.$call('anonymous:devframe:auth', { authToken: authToken!, ua: 'test', origin: 'http://localhost' })
      expect(reauth).toEqual({ isTrusted: true })
      await expect(returning.$call('test:trusted-only' as any)).resolves.toBe('ok')
      expect(getTempAuthCode()).toBe(codeAfterExchange)
      returning.$close()
    }
    finally {
      await server.close()
    }
  })

  it('onTrusted() fires once a code exchange succeeds, after the rotated code is printed', async () => {
    const banners: { code: string, url: string }[] = []
    const trusted: { authToken: string, bannerCountAtCall: number, lastBannerCode?: string }[] = []
    const { server, host, port } = await startAuthenticatedServer(banners, false, info => trusted.push({
      authToken: info.authToken,
      bannerCountAtCall: banners.length,
      lastBannerCode: banners.at(-1)?.code,
    }))

    try {
      const client = connectClient(host, port)
      await client.$call('anonymous:devframe:auth:exchange', { code: 'wrong1', ua: 'test', origin: 'http://localhost' })
      expect(trusted).toHaveLength(0)

      const code = getTempAuthCode()
      const { authToken } = await client.$call('anonymous:devframe:auth:exchange', { code, ua: 'test', origin: 'http://localhost' })

      expect(trusted.map(info => info.authToken)).toEqual([authToken])
      expect(trusted[0]!.bannerCountAtCall).toBe(banners.length)
      expect(trusted[0]!.lastBannerCode).toBe(getTempAuthCode())
      client.$close()
    }
    finally {
      await server.close()
    }
  })

  it('preserves trust established by the host before the client handshake', async () => {
    const { server, host, port } = await startAuthenticatedServer([], true)

    try {
      const client = connectClient(host, port)
      const handshake = await client.$call('anonymous:devframe:auth', { authToken: '', ua: 'test', origin: 'http://localhost' })

      expect(handshake).toEqual({ isTrusted: true })
      await expect(client.$call('test:trusted-only' as any)).resolves.toBe('ok')
      client.$close()
    }
    finally {
      await server.close()
    }
  })

  describe('remote-dock tokens (onConnect)', () => {
    // Minimal stand-in for the crossws `Peer` — `onConnect` only reads
    // `request.url` and `request.headers.get('origin')`.
    function fakePeer(token: string, origin?: string): any {
      return {
        request: {
          url: `/?devframe_auth_token=${encodeURIComponent(token)}`,
          headers: { get: (name: string) => (name.toLowerCase() === 'origin' ? origin ?? null : null) },
        },
      }
    }

    it('trusts a valid remote-dock token when originLock is off, regardless of origin', async () => {
      const context = await createTestContext()
      const auth = createInteractiveAuth(context)
      const token = getInternalContext(context).allocateRemoteToken('dock-1', 'http://localhost:5173', false)

      const session = { meta: {} } as any
      auth.onConnect(fakePeer(token, 'http://anywhere.example'), session)
      expect(session.meta.isTrusted).toBe(true)
      expect(session.meta.clientAuthToken).toBe(token)
    })

    it('honors originLock: trusts only when the request Origin matches the dock origin', async () => {
      const context = await createTestContext()
      const auth = createInteractiveAuth(context)
      const dockOrigin = 'http://localhost:5173'
      const token = getInternalContext(context).allocateRemoteToken('dock-2', dockOrigin, true)

      const matching = { meta: {} } as any
      auth.onConnect(fakePeer(token, dockOrigin), matching)
      expect(matching.meta.isTrusted).toBe(true)

      const mismatched = { meta: {} } as any
      auth.onConnect(fakePeer(token, 'http://evil.example'), mismatched)
      expect(mismatched.meta.isTrusted).toBeUndefined()

      const noOrigin = { meta: {} } as any
      auth.onConnect(fakePeer(token), noOrigin)
      expect(noOrigin.meta.isTrusted).toBeUndefined()
    })

    it('does not trust an unknown or revoked remote token', async () => {
      const context = await createTestContext()
      const auth = createInteractiveAuth(context)
      const internal = getInternalContext(context)
      const token = internal.allocateRemoteToken('dock-3', 'http://localhost:5173', false)
      internal.revokeRemoteTokensForDock('dock-3')

      const session = { meta: {} } as any
      auth.onConnect(fakePeer(token, 'http://localhost:5173'), session)
      expect(session.meta.isTrusted).toBeUndefined()

      const unknown = { meta: {} } as any
      auth.onConnect(fakePeer('deadbeef', 'http://localhost:5173'), unknown)
      expect(unknown.meta.isTrusted).toBeUndefined()
    })
  })

  it('self-revoke: devframe:auth:revoke drops the caller to untrusted and invalidates the token', async () => {
    const { server, host, port } = await startAuthenticatedServer()

    try {
      const client = connectClient(host, port)
      const code = getTempAuthCode()
      const { authToken } = await client.$call('anonymous:devframe:auth:exchange', { code, ua: 'test', origin: 'http://localhost' })
      expect(authToken).toBeTruthy()

      await client.$call('devframe:auth:revoke')
      await expect(client.$call('test:trusted-only' as any)).rejects.toThrow()
      client.$close()

      // The revoked token no longer re-authenticates.
      const reconnect = connectClient(host, port, authToken!)
      const result = await reconnect.$call('anonymous:devframe:auth', { authToken: authToken!, ua: 'test', origin: 'http://localhost' })
      expect(result).toEqual({ isTrusted: false })
      reconnect.$close()
    }
    finally {
      await server.close()
    }
  })
})
