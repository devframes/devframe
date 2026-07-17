/**
 * Inject the data inspector into a running process — expose that process's
 * registered data sources to an external data-inspector UI.
 *
 * Two ways in:
 *
 * ```ts
 * // 1. explicit, from the target's code — pass sources inline …
 * import { exposeDataInspector } from '@devframes/plugin-data-inspector/inject'
 *
 * await exposeDataInspector({
 *   sources: [{ id: 'app:store', title: 'App store', data: () => store }],
 * })
 *
 * // … or register them separately through the global registry.
 * import { registerDataSource } from '@devframes/plugin-data-inspector/registry'
 * registerDataSource({ id: 'app:store', title: 'App store', data: () => store })
 * await exposeDataInspector()
 * ```
 *
 * ```sh
 * # 2. zero code change — preload the inject entry into any Node process
 * DEVFRAME_DATA_INSPECTOR=1 node --import @devframes/plugin-data-inspector/inject server.js
 * ```
 *
 * It binds `127.0.0.1` and requires devframe's trust handshake by
 * default: a random pre-shared token is minted per run, printed to stderr,
 * and written (with the endpoint) to the discovery file
 * `<cwd>/node_modules/.data-inspector/agent.json`, which
 * `devframe-data-inspector attach` consumes automatically. Connected
 * inspectors run eval-grade queries against live objects in this process —
 * treat the endpoint like a debugger port.
 */
import type { DevframeHost, DevframeNodeContext } from 'devframe/types'
import type { DataSourceEntry } from '../registry/index'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { createHostContext, startHttpAndWs } from 'devframe/node'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { randomToken } from 'devframe/utils/crypto-token'
import { getPort } from 'get-port-please'

/** Discovery file path, relative to the target process's cwd. */
export const AGENT_DISCOVERY_FILE = 'node_modules/.data-inspector/agent.json'

export interface AgentDiscovery {
  /** WS endpoint of the agent, e.g. `ws://127.0.0.1:9878`. */
  websocket: string
  /** Pre-shared token the inspector must present. Absent when `auth: false`. */
  token?: string
  pid: number
  startedAt: number
}

export interface ExposeDataInspectorOptions {
  /**
   * Data sources to expose, registered before the endpoint opens. A
   * convenience over calling `registerDataSource` yourself; the two paths
   * share one process-global registry, so inline sources and separately
   * registered ones coexist (a later registration replaces an earlier one
   * with the same id).
   */
  sources?: DataSourceEntry[]
  /** Preferred port (falls back to a free one nearby). Default 9878. */
  port?: number
  /**
   * Require the trust handshake with a pre-shared token (default `true`).
   * `false` opens the endpoint to any local connection.
   */
  auth?: boolean
  /** Override the minted token (e.g. from an env secret). */
  token?: string
  /** Skip writing the discovery file. */
  discoveryFile?: boolean
  /** Suppress the stderr banner. */
  silent?: boolean
  /**
   * Register the built-in example source (devframe context, OS, live
   * process stats of the target). Default `true`; set `false` (or
   * `DEVFRAME_DATA_INSPECTOR_EXAMPLE=0` on the `--import` path) to expose
   * only the target's own registrations.
   */
  exampleSource?: boolean
}

export interface DataInspectorAgent {
  websocket: string
  token?: string
  close: () => Promise<void>
}

/** Start the agent endpoint in the current process. */
export async function exposeDataInspector(options: ExposeDataInspectorOptions = {}): Promise<DataInspectorAgent> {
  // Deferred so `--import`ing the agent never pulls the whole node surface
  // into processes that don't enable it.
  const { setupDataInspector } = await import('../node/index')

  if (options.sources?.length) {
    const { registerDataSource } = await import('../registry/index')
    for (const source of options.sources)
      registerDataSource(source)
  }

  const cwd = process.cwd()
  const port = await getPort({ port: options.port ?? 9878, portRange: [9878, 9978] })
  const websocket = `ws://127.0.0.1:${port}`

  const host: DevframeHost = {
    mountStatic() {},
    mountConnectionMeta() {},
    resolveOrigin: () => `http://127.0.0.1:${port}`,
    getStorageDir(scope) {
      if (scope === 'workspace')
        return join(cwd, '.devframe')
      if (scope === 'project')
        return join(cwd, 'node_modules/.data-inspector/devframe')
      return join(homedir(), '.data-inspector/devframe')
    },
  }

  const context: DevframeNodeContext = await createHostContext({ cwd, mode: 'dev', host })
  setupDataInspector(context, { exampleSource: options.exampleSource })

  const useAuth = options.auth ?? true
  const token = useAuth ? (options.token ?? randomToken()) : undefined
  const auth = useAuth
    ? createInteractiveAuth(context, { clientAuthTokens: [token!], banner: () => {} })
    : false

  const handle = await startHttpAndWs({ context, port, auth })

  const discoveryPath = join(cwd, AGENT_DISCOVERY_FILE)
  if (options.discoveryFile !== false) {
    const discovery: AgentDiscovery = { websocket, token, pid: process.pid, startedAt: Date.now() }
    mkdirSync(dirname(discoveryPath), { recursive: true })
    writeFileSync(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`)
    process.once('exit', () => {
      try {
        rmSync(discoveryPath, { force: true })
      }
      catch {}
    })
  }

  if (!options.silent) {
    // The agent runs inside arbitrary user processes: stderr, not stdout,
    // so it never corrupts piped program output.
    console.error(`[data-inspector] agent listening on ${websocket} (pid ${process.pid})`)
    console.error(`[data-inspector] attach with: devframe-data-inspector attach${options.discoveryFile === false && token ? ` ${websocket} --token ${token}` : ''}`)
  }

  return {
    websocket,
    token,
    close: async () => {
      if (options.discoveryFile !== false) {
        try {
          rmSync(discoveryPath, { force: true })
        }
        catch {}
      }
      await handle.close()
    },
  }
}

// `node --import @devframes/plugin-data-inspector/inject` path: opt in via env
// so merely importing the module never opens a port.
if (process.env.DEVFRAME_DATA_INSPECTOR === '1' || process.env.DEVFRAME_DATA_INSPECTOR === 'true') {
  void exposeDataInspector({
    port: process.env.DEVFRAME_DATA_INSPECTOR_PORT ? Number(process.env.DEVFRAME_DATA_INSPECTOR_PORT) : undefined,
    auth: process.env.DEVFRAME_DATA_INSPECTOR_AUTH !== '0',
    token: process.env.DEVFRAME_DATA_INSPECTOR_TOKEN,
    exampleSource: process.env.DEVFRAME_DATA_INSPECTOR_EXAMPLE !== '0',
  }).catch((error) => {
    console.error('[data-inspector] agent failed to start:', error)
  })
}
