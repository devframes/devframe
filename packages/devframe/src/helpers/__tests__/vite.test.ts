import type { DevframeDefinition } from '../../types/devframe'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'get-port-please'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readDevframeInstances } from '../../node/instance-registry'
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

interface FakeViteServer {
  middlewares: { use: (path: string, handler: any) => void }
  httpServer: null
  routes: Map<string, any>
}

function fakeViteServer(): FakeViteServer {
  const routes = new Map<string, any>()
  return {
    middlewares: { use: (path, handler) => routes.set(path, handler) },
    httpServer: null,
    routes,
  }
}

/** Invoke a registered connect-style middleware and capture its JSON body. */
async function readJsonMiddleware(handler: any): Promise<any> {
  return await new Promise((resolvePromise) => {
    handler(undefined, {
      setHeader: () => {},
      end: (body: string) => resolvePromise(JSON.parse(body)),
    })
  })
}

describe('viteDevBridge (bridge mode mcp)', () => {
  let bridge: ReturnType<typeof viteDevBridge> | undefined

  afterEach(async () => {
    await bridge?.closeBundle?.()
    bridge = undefined
    vi.unstubAllEnvs()
  })

  it('forwards the mcp option and advertises the side-car endpoint in the meta', async () => {
    // Point the instance registry at a temp dir so we can read back the
    // per-instance MCP bearer token the side-car minted (never advertised in
    // the meta) and present it, exactly as `devframe connect` does.
    const registryDir = mkdtempSync(join(tmpdir(), 'df-vite-bridge-registry-'))
    vi.stubEnv('DEVFRAME_INSTANCES_DIR', registryDir)
    // The test harness disables the registry globally; re-enable it here so the
    // side-car writes the record carrying the MCP token.
    vi.stubEnv('DEVFRAME_DISABLE_INSTANCE_REGISTRY', '0')

    const port = await getPort({ port: 19710, host: '127.0.0.1' })
    bridge = viteDevBridge(defineTestDef(), {
      devMiddleware: { port, host: '127.0.0.1' },
      mcp: true,
      // The bridge now gates by default; opt out here so this test can dial
      // the WS/MCP side-car directly. (MCP still requires its bearer token.)
      auth: false,
    })

    const server = fakeViteServer()
    await bridge.configureServer(server)

    const metaHandler = server.routes.get('/__vite-bridge-test/__connection.json')
    expect(metaHandler).toBeDefined()
    const meta = await readJsonMiddleware(metaHandler)
    expect(meta.backend).toBe('websocket')
    expect(meta.websocket).toEqual({ port, path: '/__devframe_ws' })
    expect(meta.mcp).toEqual({ port, path: '/__mcp' })
    // The token is never advertised in the meta.
    expect(meta.mcp.token).toBeUndefined()

    const token = readDevframeInstances({ instancesDir: registryDir }).find(r => r.port === port)?.mcp?.token
    expect(token).toBeTypeOf('string')

    // The advertised endpoint is live: a real MCP client presenting the
    // registry-recorded bearer token can connect and list the agent tools.
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/__mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
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

  it('omits the mcp block when the option is not set', async () => {
    const port = await getPort({ port: 19720, host: '127.0.0.1' })
    bridge = viteDevBridge(defineTestDef(), {
      devMiddleware: { port, host: '127.0.0.1' },
      auth: false,
    })

    const server = fakeViteServer()
    await bridge.configureServer(server)

    const meta = await readJsonMiddleware(server.routes.get('/__vite-bridge-test/__connection.json'))
    expect(meta.mcp).toBeUndefined()
  })
})

describe('viteDevBridge (auth default)', () => {
  let bridge: ReturnType<typeof viteDevBridge> | undefined

  afterEach(async () => {
    await bridge?.closeBundle?.()
    bridge = undefined
  })

  /** Handshake result on a fresh, unauthenticated WS connection. */
  async function handshakeIsTrusted(port: number): Promise<boolean> {
    const rpc = createRpcClient<any, any>({}, {
      channel: createWsRpcChannel({ url: `ws://127.0.0.1:${port}/__devframe_ws` }),
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
    await bridge.configureServer(fakeViteServer())

    // A gated server answers the handshake with `isTrusted: false` until a
    // code is exchanged; an ungated (`auth: false`) server auto-trusts.
    expect(await handshakeIsTrusted(port)).toBe(false)
  })

  it('opts out when auth: false is passed explicitly (auto-trust handshake)', async () => {
    const port = await getPort({ port: 19740, host: '127.0.0.1' })
    bridge = viteDevBridge(defineTestDef(), { devMiddleware: { port, host: '127.0.0.1' }, auth: false })
    await bridge.configureServer(fakeViteServer())

    expect(await handshakeIsTrusted(port)).toBe(true)
  })
})
