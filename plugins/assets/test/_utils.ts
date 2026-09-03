import type { DevframeNodeContext } from 'devframe'
import type { StartedServer } from 'devframe/internal'
import type { AssetsDevframeOptions } from '../src/node/index'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createRpcStreamingClientHost } from 'devframe/client'
import { createH3DevframeHost } from 'devframe/internal'
import { createHostContext } from 'devframe/node'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'devframe/utils/get-port'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { H3 } from 'h3'
import { serveTestContext } from '../../../tests/helpers/serve-test-context'
import { createAssetsDevframe } from '../src/node/index'
import { disposeAssetsWatcher } from '../src/node/setup'

export interface AssetsServer extends StartedServer {
  ctx: DevframeNodeContext
  port: number
  dir: string
}

/** Creates a fresh temp directory managed assets scan/write into, cleaned up by the caller. */
export async function createTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'devframes-plugin-assets-'))
}

/**
 * Boot the assets devframe in-process over real HTTP + WebSocket so the
 * full RPC + streaming + live-serving path is exercised end to end.
 */
export async function startAssetsServer(
  dir: string,
  options: AssetsDevframeOptions = {},
): Promise<AssetsServer> {
  const definition = createAssetsDevframe({ dir, ...options })
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })

  const app = new H3()
  const origin = `http://${host}:${port}`
  const h3Host = createH3DevframeHost({
    origin,
    appName: definition.id,
    mount: (base, distDir) => mountStaticHandler(app, base, distDir),
  })

  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
  // Mirror the adapters: queue the definition's declared wire services,
  // ready them, THEN run setup (services ready before setup).
  for (const input of definition.services ?? [])
    void ctx.services.install(input, { resolveFrom: definition.packageName })
  await ctx.services.ready()
  await definition.setup(ctx)

  const server = await serveTestContext({ context: ctx, host, port, app, auth: false })

  // The live file watcher started by `setupAssets` otherwise keeps the
  // process alive past the test run.
  const closeServer = server.close.bind(server)
  server.close = async () => {
    await disposeAssetsWatcher(ctx)
    await closeServer()
  }

  return Object.assign(server, { ctx, port, dir })
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

export interface TestClient {
  rpc: ReturnType<typeof createRpcClient>
  streaming: ReturnType<typeof createRpcStreamingClientHost>
  /** Registers a handler for a server-broadcast event by name (e.g. `devframes:plugin:assets:changed`). */
  onEvent: (name: string, handler: (...args: any[]) => void) => void
}

/**
 * Minimal RPC + streaming client over the WS transport, mirroring the
 * terminals plugin's test harness. `connectDevframe` is skipped because it
 * needs a browser-like environment for connection-meta lookup.
 */
export function bootClient(port: number): TestClient {
  const listeners = new Set<(trusted: boolean) => void>()
  const fakeEvents = {
    on(name: string, fn: (trusted: boolean) => void) {
      if (name === 'rpc:is-trusted:updated')
        listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  const clientFns: any = {}
  const clientRpcStub = {
    register(def: { name: string, handler: (...args: any[]) => any }) {
      clientFns[def.name] = def.handler
    },
  }

  const rpc = createRpcClient<any, any>(clientFns, {
    channel: createWsRpcChannel({ url: `ws://127.0.0.1:${port}` }),
  })

  const fakeRpcClient = {
    isTrusted: true,
    events: fakeEvents,
    client: clientRpcStub,
    callEvent: (name: any, ...args: any[]) => (rpc as any).$callEvent(name, ...args),
  } as any

  const streaming = createRpcStreamingClientHost(fakeRpcClient)
  return {
    rpc,
    streaming,
    onEvent: (name, handler) => { clientFns[name] = handler },
  }
}

export function call<T = any>(client: TestClient, method: string, ...args: any[]): Promise<T> {
  return (client.rpc as any).$call(method, ...args) as Promise<T>
}
