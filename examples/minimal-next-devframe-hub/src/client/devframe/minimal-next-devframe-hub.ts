import type { DevframeHubContext } from '@devframes/hub/node'
import type { StartedServer } from 'devframe/node'
import type { ConnectionMeta, DevframeDefinition, DevframeHost } from 'devframe/types'
import { homedir } from 'node:os'
import process from 'node:process'
import { defineHubRpcFunction } from '@devframes/hub'
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { startHttpAndWs } from 'devframe/node'
import { getPort } from 'get-port-please'
import { dirname, join } from 'pathe'
import demoDevframe from './demo-devframe'
import demoDevframeB from './demo-devframe-b'

/**
 * Built-in plugin packages dogfooded through the hub mount path.
 *
 * They are loaded with a runtime dynamic `import()` carrying
 * `webpackIgnore` / `turbopackIgnore` magic comments so Next's bundler leaves
 * them alone: Node resolves the published `dist` at request time, where the
 * plugins' node-side code (git shell-outs, child-process supervisors, the
 * native `zigpty` PTY backend) and their `new URL('../dist/...',
 * import.meta.url)` SPA-dist lookups all work — none of which survive being
 * statically bundled into a Next server chunk.
 */
const BUILTIN_PLUGIN_PACKAGES = [
  '@devframes/plugin-git',
  '@devframes/plugin-terminals',
  '@devframes/plugin-code-server',
  '@devframes/plugin-inspect',
  '@devframes/plugin-a11y',
  '@devframes/plugin-messages',
] as const

async function loadBuiltinPlugins(): Promise<DevframeDefinition[]> {
  const mods = await Promise.all(
    BUILTIN_PLUGIN_PACKAGES.map(
      pkg => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pkg),
    ),
  )
  return mods.map(mod => mod.default as DevframeDefinition)
}

/** URL base the a11y agent module is served under (same-origin, catch-all route). */
const A11Y_AGENT_MOUNT_BASE = '/__df-a11y-agent/'

interface A11yAgentMount {
  /** The a11y devframe's dock id — the dock the client script attaches to. */
  dockId: string
  /** On-disk directory holding the built agent module. */
  dir: string
  /** Same-origin URL of the agent module, importable by the hub client runtime. */
  importFrom: string
}

/**
 * Locate the a11y inspector's in-page **agent** module so the hub can serve it
 * same-origin and attach it to the a11y dock as its client script — the hub
 * client runtime (booted in `app/page.tsx`) imports it into the host page,
 * where it scans this hub live. Loaded through the same bundler-ignored dynamic
 * `import()` as the plugins, since the package resolves its `dist` via
 * `import.meta.url`. Returns `null` if unavailable.
 */
async function loadA11yAgentMount(): Promise<A11yAgentMount | null> {
  try {
    const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/plugin-a11y')
    const bundle = mod.a11yAgentBundlePath as string
    return {
      dockId: (mod.default as DevframeDefinition).id,
      dir: dirname(bundle),
      importFrom: `${A11Y_AGENT_MOUNT_BASE}inject.js`,
    }
  }
  catch {
    return null
  }
}

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

// Bases (without trailing slash, e.g. `/__git`) under which the catch-all
// route should serve the hub's connection meta at `<base>/__connection.json`.
const CONNECTION_META_BASES = new Set<string>()
const META_SUFFIX = `/${DEVFRAME_CONNECTION_META_FILENAME}`

/**
 * If `pathname` is a `<base>/__connection.json` request for a base the hub
 * registered via `DevframeHost.mountConnectionMeta`, return that base;
 * otherwise `null`. The catch-all route uses this to answer the connection-meta
 * fetch a mounted devframe SPA makes from inside its iframe.
 */
export function isConnectionMetaPath(pathname: string): boolean {
  if (!pathname.endsWith(META_SUFFIX))
    return false
  return CONNECTION_META_BASES.has(pathname.slice(0, -META_SUFFIX.length))
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
    // Record the base so the catch-all route can answer `<base>/__connection.json`
    // with the hub's connection meta — letting the mounted SPA connect without
    // relying on same-origin parent-window inheritance.
    mountConnectionMeta(base) {
      CONNECTION_META_BASES.add(base.replace(/\/$/, ''))
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

  // Demo devframes alongside the dogfooded built-in plugin packages.
  const devframes = options.devframes
    ?? [demoDevframe, demoDevframeB, ...await loadBuiltinPlugins()]

  await context.messages.add({
    level: 'success',
    message: 'Minimal Next Devframe Hub started',
    description: `Side-car WS on port ${port}. ${devframes.length} devframe(s) registered.`,
  })

  // Serve the a11y inspector's in-page agent same-origin (via the catch-all
  // route) and attach it to the a11y dock as its client script. The hub client
  // runtime booted in `app/page.tsx` imports it into the host page, where it
  // scans this hub live; the panel iframe shares the origin, so their
  // BroadcastChannel connects.
  const a11yAgent = await loadA11yAgentMount()
  if (a11yAgent)
    host.mountStatic(A11Y_AGENT_MOUNT_BASE, a11yAgent.dir)

  for (const def of devframes) {
    const clientScript = a11yAgent && def.id === a11yAgent.dockId
      ? { importFrom: a11yAgent.importFrom }
      : undefined
    await mountDevframe(context, def, clientScript ? { dock: { clientScript } } : undefined)
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
