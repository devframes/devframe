import type { HubHostCapabilities, HubNodeContext } from '@devframes/hub/node'
import type { StartedServer } from 'devframe/node'
import type { ConnectionMeta, DevframeDefinition, DevToolsHost } from 'devframe/types'
import { homedir } from 'node:os'
import process from 'node:process'
import { defineRpcFunction } from '@devframes/hub'
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import { startHttpAndWs } from 'devframe/node'
import { launchEditor } from 'devframe/utils/launch-editor'
import { getPort } from 'get-port-please'
import { join } from 'pathe'
import demoDevframe from './demo-devframe'

export interface MinimalNextDevToolsHubOptions {
  /** Preferred port for the side-car RPC/WS server. Default: a free port near 9877. */
  port?: number
  /** Hostname for the side-car server. Default: `localhost`. */
  host?: string
  /** Workspace root used by hub host capabilities. Default: `process.cwd()`. */
  cwd?: string
  /** Devframes to mount as docks. */
  devframes?: DevframeDefinition[]
}

export interface StartedMinimalNextDevToolsHub extends StartedServer {
  context: HubNodeContext
  connectionMeta: ConnectionMeta & { backend: 'websocket', websocket: number }
}

const minimalNextHubMessagesList = defineRpcFunction({
  name: 'minimal-next-devtools-hub:messages:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: HubNodeContext) => ({
    async handler() {
      return Array.from(ctx.messages.entries.values())
    },
  }),
})

const minimalNextHubTerminalsList = defineRpcFunction({
  name: 'minimal-next-devtools-hub:terminals:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: HubNodeContext) => ({
    async handler() {
      return Array.from(ctx.terminals.sessions.values()).map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        status: s.status,
      }))
    },
  }),
})

export async function minimalNextDevToolsHub(
  options: MinimalNextDevToolsHubOptions = {},
): Promise<StartedMinimalNextDevToolsHub> {
  const cwd = options.cwd ?? process.cwd()
  const hostName = options.host ?? 'localhost'

  const host: DevToolsHost & HubHostCapabilities = {
    mountStatic() {
      // Static mounting for devframe SPAs would route through Next middleware
      // in a fuller host. This minimal example keeps mounted devframes headless.
    },
    resolveOrigin() {
      return `http://${hostName}:3000`
    },
    getStorageDir(scope) {
      return scope === 'workspace'
        ? join(cwd, 'node_modules/.minimal-next-devtools-hub')
        : join(homedir(), '.minimal-next-devtools-hub')
    },
    async openPath(filepath, line, column) {
      const absolute = join(cwd, filepath)
      const target = line
        ? `${absolute}:${line}${column ? `:${column}` : ''}`
        : absolute
      launchEditor(target)
      return true
    },
  }

  const port = options.port ?? await getPort({ host: hostName, port: 9877, random: false })

  const context = await createHubContext({
    cwd,
    workspaceRoot: cwd,
    mode: 'dev',
    host,
    builtinRpcDeclarations: [
      minimalNextHubMessagesList,
      minimalNextHubTerminalsList,
    ],
  })

  context.commands.register({
    id: 'minimal-next-devtools-hub:ping',
    title: 'Next Hub: Ping',
    icon: 'ph:bell-duotone',
    category: 'hub',
    handler: () => 'pong',
  })

  await context.messages.add({
    level: 'success',
    message: 'Minimal Next DevTools Hub started',
    description: `Side-car WS on port ${port}. ${options.devframes?.length ?? 1} devframe(s) registered.`,
  })

  for (const def of options.devframes ?? [demoDevframe]) {
    await mountDevframe(context, def)
  }

  const started = await startHttpAndWs({
    context,
    host: hostName,
    port,
    auth: false,
  })

  return Object.assign(started, {
    context,
    connectionMeta: {
      backend: 'websocket' as const,
      websocket: started.port,
    },
  })
}

const GLOBAL_KEY = '__minimalNextDevToolsHub'

type GlobalWithHub = typeof globalThis & {
  [GLOBAL_KEY]?: Promise<StartedMinimalNextDevToolsHub>
}

export function ensureMinimalNextDevToolsHub(
  options: MinimalNextDevToolsHubOptions = {},
): Promise<StartedMinimalNextDevToolsHub> {
  const globalHub = globalThis as GlobalWithHub
  globalHub[GLOBAL_KEY] ??= minimalNextDevToolsHub(options)
  return globalHub[GLOBAL_KEY]
}
