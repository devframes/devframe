import type { DevframeDefinition } from '../../types/devframe'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
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
  })

  it('forwards the mcp option and advertises the side-car endpoint in the meta', async () => {
    const port = await getPort({ port: 19710, host: '127.0.0.1' })
    bridge = viteDevBridge(defineTestDef(), {
      devMiddleware: { port, host: '127.0.0.1' },
      mcp: true,
    })

    const server = fakeViteServer()
    await bridge.configureServer(server)

    const metaHandler = server.routes.get('/__vite-bridge-test/__connection.json')
    expect(metaHandler).toBeDefined()
    const meta = await readJsonMiddleware(metaHandler)
    expect(meta.backend).toBe('websocket')
    expect(meta.websocket).toEqual({ port, path: '/__devframe_ws' })
    expect(meta.mcp).toEqual({ port, path: '/__mcp' })

    // The advertised endpoint is live: a real MCP client can connect and
    // list the agent tools on the side-car origin.
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/__mcp`))
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
    })

    const server = fakeViteServer()
    await bridge.configureServer(server)

    const meta = await readJsonMiddleware(server.routes.get('/__vite-bridge-test/__connection.json'))
    expect(meta.mcp).toBeUndefined()
  })
})
