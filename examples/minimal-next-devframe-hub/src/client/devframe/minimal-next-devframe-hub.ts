import type { DevframeHubContext } from '@devframes/hub/node'
import type { StartedServer } from 'devframe/node'
import type { ConnectionMeta, DevframeDefinition, DevframeHost } from 'devframe/types'
import { homedir } from 'node:os'
import process from 'node:process'
import { defineHubRpcFunction } from '@devframes/hub'
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import { startHttpAndWs } from 'devframe/node'
import { getPort } from 'get-port-please'
import { join } from 'pathe'
import demoDevframe from './demo-devframe'
import demoDevframeB from './demo-devframe-b'

const STATIC_MOUNTS = new Map<string, string>()

export interface StaticMountHit {
  distDir: string
  relative: string
}

export function getStaticMount(pathname: string): StaticMountHit | null {
  let best: { base: string, distDir: string } | null = null
  for (const [base, distDir] of STATIC_MOUNTS) {
    if (pathname === base || pathname.startsWith(`${base}/`)) {
      if (!best || base.length > best.base.length)
        best = { base, distDir }
    }
  }
  if (!best)
    return null
  const relative = pathname.slice(best.base.length) || '/'
  return { distDir: best.distDir, relative }
}

export interface MinimalNextDevframeHubOptions {
  /** Preferred port for the side-car RPC/WS server. Default: a free port near 9877. */
  port?: number
  /** Hostname for the side-car server. Default: `localhost`. */
  host?: string
  /** Workspace root used by hub host capabilities. Default: `process.cwd()`. */
  cwd?: string
  /** Devframes to mount as docks. */
  devframes?: DevframeDefinition[]
}

export interface StartedMinimalNextDevframeHub extends StartedServer {
  context: DevframeHubContext
  connectionMeta: ConnectionMeta & { backend: 'websocket', websocket: number }
}

const minimalNextHubMessagesList = defineHubRpcFunction({
  name: 'minimal-next-devframe-hub:messages:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: DevframeHubContext) => ({
    async handler() {
      return Array.from(ctx.messages.entries.values())
    },
  }),
})

const minimalNextHubTerminalsList = defineHubRpcFunction({
  name: 'minimal-next-devframe-hub:terminals:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: DevframeHubContext) => ({
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

export async function minimalNextDevframeHub(
  options: MinimalNextDevframeHubOptions = {},
): Promise<StartedMinimalNextDevframeHub> {
  const cwd = options.cwd ?? process.cwd()
  const hostName = options.host ?? 'localhost'

  const host: DevframeHost = {
    mountStatic(base, distDir) {
      STATIC_MOUNTS.set(base.replace(/\/$/, ''), distDir)
    },
    resolveOrigin() {
      return `http://${hostName}:3000`
    },
    getStorageDir(scope) {
      return scope === 'workspace'
        ? join(cwd, 'node_modules/.minimal-next-devframe-hub')
        : join(homedir(), '.minimal-next-devframe-hub')
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
    id: 'minimal-next-devframe-hub:ping',
    title: 'Next Hub: Ping',
    icon: 'ph:bell-duotone',
    category: 'hub',
    handler: () => 'pong',
  })

  await context.messages.add({
    level: 'success',
    message: 'Minimal Next Devframe Hub started',
    description: `Side-car WS on port ${port}. ${options.devframes?.length ?? 1} devframe(s) registered.`,
  })

  for (const def of options.devframes ?? [demoDevframe, demoDevframeB]) {
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

const GLOBAL_KEY = '__minimalNextDevframeHub'

type GlobalWithHub = typeof globalThis & {
  [GLOBAL_KEY]?: Promise<StartedMinimalNextDevframeHub>
}

export function ensureMinimalNextDevframeHub(
  options: MinimalNextDevframeHubOptions = {},
): Promise<StartedMinimalNextDevframeHub> {
  const globalHub = globalThis as GlobalWithHub
  globalHub[GLOBAL_KEY] ??= minimalNextDevframeHub(options)
  return globalHub[GLOBAL_KEY]
}
