import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { DevframeDefinition } from '../../types/devframe'
import type { DevframeViteDevServerLike } from '../vite'
import { createServer } from 'node:http'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'get-port-please'
import { afterEach, describe, expect, it } from 'vitest'
import { viteDevBridge } from '../vite'

function defineTestDef(): DevframeDefinition {
  return {
    id: 'vite-bridge-test',
    name: 'Vite Bridge Test',
    version: '0.0.0',
    packageName: '@devframe/vite-bridge-test',
    homepage: '',
    description: '',
    setup(ctx) {
      ctx.agent.registerTool({
        id: 'greet',
        description: 'Say hello.',
        safety: 'read',
        handler: () => ({ greeting: 'hi' }),
      })
    },
  }
}

type ConnectMiddleware = (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void

/**
 * A minimal stand-in for Vite's dev server: a real node http server whose
 * request handling walks the registered connect middlewares in order —
 * enough to exercise both `use(fn)` and `use(path, fn)` registrations and
 * the shared-`httpServer` WS tier.
 */
interface FakeViteServer extends DevframeViteDevServerLike {
  httpServer: NodeHttpServer
  listen: (port: number, host: string) => Promise<void>
  close: () => void
}

function fakeViteServer(): FakeViteServer {
  const stack: Array<{ path?: string, handler: ConnectMiddleware }> = []
  const httpServer = createServer((req, res) => {
    let i = 0
    const next = (): void => {
      const entry = stack[i++]
      if (!entry) {
        res.statusCode = 404
        res.end()
        return
      }
      if (entry.path && !(req.url ?? '/').startsWith(entry.path)) {
        next()
        return
      }
      entry.handler(req, res, next)
    }
    next()
  })
  return {
    middlewares: {
      use: ((pathOrHandler: string | ConnectMiddleware, maybeHandler?: ConnectMiddleware) => {
        if (typeof pathOrHandler === 'string')
          stack.push({ path: pathOrHandler, handler: maybeHandler! })
        else
          stack.push({ handler: pathOrHandler })
      }) as DevframeViteDevServerLike['middlewares']['use'],
    },
    httpServer,
    listen: (port, host) => new Promise<void>(resolve => httpServer.listen(port, host, resolve)),
    close: () => {
      httpServer.close()
      httpServer.closeAllConnections()
    },
  }
}

describe('viteDevBridge (bridge mode mcp)', () => {
  let bridge: ReturnType<typeof viteDevBridge> | undefined
  let vite: FakeViteServer | undefined

  afterEach(async () => {
    await bridge?.closeBundle?.()
    bridge = undefined
    vite?.close()
    vite = undefined
  })

  it('serves discovery + MCP through the Vite middleware; pinned port advertises the side-car', async () => {
    const host = '127.0.0.1'
    const vitePort = await getPort({ port: 19705, host })
    const wsPort = await getPort({ port: 19710, host })
    bridge = viteDevBridge(defineTestDef(), {
      devMiddleware: { port: wsPort, host },
      mcp: true,
      // The bridge gates by default; opt out here so this test can dial
      // the WS side-car and MCP route directly.
      auth: false,
    })

    vite = fakeViteServer()
    await vite.listen(vitePort, host)
    await bridge.configureServer(vite)

    const meta = await (await fetch(`http://${host}:${vitePort}/__vite-bridge-test/__connection.json`)).json()
    expect(meta.backend).toBe('websocket')
    // Pinned port → explicit side-car; the route rides the unified `__ws`.
    expect(meta.websocket).toEqual({ port: wsPort, path: '__ws' })
    // MCP lives on the Vite origin itself now (same-origin relative path).
    expect(meta.mcp).toEqual({ path: '__mcp' })

    // The advertised endpoint is live: a real MCP client presenting a loopback
    // Origin (required by the route's gate) can connect and list agent tools.
    const transport = new StreamableHTTPClientTransport(new URL(`http://${host}:${vitePort}/__vite-bridge-test/__mcp`), {
      requestInit: { headers: { origin: `http://${host}:${vitePort}` } },
    })
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    try {
      await client.connect(transport)
      const tools = await client.listTools()
      expect(tools.tools.map(t => t.name)).toContain('greet')
    }
    finally {
      await client.close()
    }
  })

  it('shares the Vite http server for the WS endpoint when no port is pinned', async () => {
    const host = '127.0.0.1'
    const vitePort = await getPort({ port: 19715, host })
    bridge = viteDevBridge(defineTestDef(), {
      devMiddleware: { host },
      auth: false,
    })

    vite = fakeViteServer()
    await vite.listen(vitePort, host)
    await bridge.configureServer(vite)

    const meta = await (await fetch(`http://${host}:${vitePort}/__vite-bridge-test/__connection.json`)).json()
    // Zero extra ports: a same-origin relative route on Vite's own server.
    expect(meta.websocket).toEqual({ path: '__ws' })
    expect(meta.mcp).toBeUndefined()

    const rpc = createRpcClient<any, any>({}, {
      channel: createWsRpcChannel({ url: `ws://${host}:${vitePort}/__vite-bridge-test/__ws` }),
    })
    try {
      const res = await rpc.$call('anonymous:devframe:auth', { authToken: '', ua: 'test', origin: 'http://localhost' }) as { isTrusted: boolean }
      expect(res.isTrusted).toBe(true)
    }
    finally {
      rpc.$close?.()
    }
  })
})

describe('viteDevBridge (auth default)', () => {
  let bridge: ReturnType<typeof viteDevBridge> | undefined
  let vite: FakeViteServer | undefined

  afterEach(async () => {
    await bridge?.closeBundle?.()
    bridge = undefined
    vite?.close()
    vite = undefined
  })

  /** Handshake result on a fresh, unauthenticated WS connection. */
  async function handshakeIsTrusted(port: number): Promise<boolean> {
    const rpc = createRpcClient<any, any>({}, {
      channel: createWsRpcChannel({ url: `ws://127.0.0.1:${port}/__ws` }),
    })
    try {
      const res = await rpc.$call('anonymous:devframe:auth', { authToken: '', ua: 'test', origin: 'http://localhost' }) as { isTrusted: boolean }
      return res.isTrusted
    }
    finally {
      rpc.$close?.()
    }
  }

  it('gates the side-car by default (unset auth → untrusted handshake)', async () => {
    const port = await getPort({ port: 19730, host: '127.0.0.1' })
    bridge = viteDevBridge(defineTestDef(), { devMiddleware: { port, host: '127.0.0.1' } })
    vite = fakeViteServer()
    await bridge.configureServer(vite)

    // A gated server answers the handshake with `isTrusted: false` until a
    // code is exchanged; an ungated (`auth: false`) server auto-trusts.
    expect(await handshakeIsTrusted(port)).toBe(false)
  })

  it('opts out when auth: false is passed explicitly (auto-trust handshake)', async () => {
    const port = await getPort({ port: 19740, host: '127.0.0.1' })
    bridge = viteDevBridge(defineTestDef(), { devMiddleware: { port, host: '127.0.0.1' }, auth: false })
    vite = fakeViteServer()
    await bridge.configureServer(vite)

    expect(await handshakeIsTrusted(port)).toBe(true)
  })
})
