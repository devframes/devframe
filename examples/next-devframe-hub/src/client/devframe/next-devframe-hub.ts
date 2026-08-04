import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeNextHost } from '@devframes/next'
import type { StartedServer } from 'devframe/node'
import type { ConnectionMeta, DevframeDefinition } from 'devframe/types'
import { homedir } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineHubRpcFunction } from '@devframes/hub'
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import { toJsonRenderDockEntry } from '@devframes/json-render/hub'
import { createDevframeNextHost } from '@devframes/next'
import { registerDevframeInstance, startHttpAndWs } from 'devframe/node'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { randomToken } from 'devframe/utils/crypto-token'
import { getPort } from 'get-port-please'
import { createDashboardView } from 'json-render/dashboard'
import { dirname, join } from 'pathe'
import demoDevframe from './demo-devframe'
import demoDevframeB from './demo-devframe-b'
import tabbedDevframe from './tabbed-devframe'

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

/**
 * Load the assets plugin and point its managed directory at this Next app's
 * `public/` (`src/client/public`) — the exact directory Next serves at `/`,
 * so the tab's previews resolve to real host URLs. Loaded through the same
 * bundler-ignored dynamic `import()` as the other plugins (its node code and
 * `import.meta.url`-based SPA-dist lookup don't survive static bundling), and
 * mounted with `watch: false` so no background file watcher lingers when the
 * hub is booted in a short-lived context (e.g. the example's own test).
 */
async function loadAssetsDevframe(): Promise<DevframeDefinition> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/plugin-assets')
  // String path ops on the module path (not `new URL('../public', …)`, which
  // Turbopack eagerly resolves as an asset import and fails on a directory) —
  // `src/client/devframe/` → `src/client/public`, the dir Next serves at `/`.
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../public')
  return (mod.createAssetsDevframe as (options: { dir: string, watch: boolean }) => DevframeDefinition)({ dir, watch: false })
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

export interface NextDevframeHubOptions {
  /** Preferred port for the side-car RPC/WS server. Default: a free port near 9877. */
  port?: number
  /** Hostname for the side-car server. Default: `localhost`. */
  host?: string
  /** Workspace root used by hub host capabilities. Default: `process.cwd()`. */
  cwd?: string
  /** Devframes to mount as docks. */
  devframes?: DevframeDefinition[]
}

export interface StartedNextDevframeHub extends StartedServer {
  context: DevframeHubContext
  connectionMeta: ConnectionMeta & { backend: 'websocket', websocket: number }
  /**
   * The bridge's WHATWG-`fetch` handler. Both the catch-all SPA route and the
   * `__hub/__connection.json` route delegate to it — it serves every mounted
   * SPA and answers `<base>/__connection.json` for the hub and each devframe.
   */
  fetch: DevframeNextHost['fetch']
}

const nextHubMessagesList = defineHubRpcFunction({
  name: 'example:next-devframe-hub:messages:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: DevframeHubContext) => ({
    async handler() {
      return Array.from(ctx.messages.entries.values())
    },
  }),
})

const nextHubTerminalsList = defineHubRpcFunction({
  name: 'example:next-devframe-hub:terminals:list',
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

export async function nextDevframeHub(
  options: NextDevframeHubOptions = {},
): Promise<StartedNextDevframeHub> {
  const cwd = options.cwd ?? process.cwd()
  const hostName = options.host ?? 'localhost'
  const nextPort = Number(process.env.PORT ?? 3000)

  // The Next host bridge: its `host` accumulates every `mountStatic` /
  // `mountConnectionMeta` call into a single `fetch` handler (backed by
  // devframe's shared `serveStaticHandler`), which the App Router routes
  // delegate to — no hand-rolled static serving or path matching here.
  const nextHost = createDevframeNextHost({
    resolveOrigin: () => `http://${hostName}:${nextPort}`,
    getStorageDir(scope) {
      if (scope === 'workspace')
        return join(cwd, '.devframe')
      if (scope === 'project')
        return join(cwd, 'node_modules/.next-devframe-hub')
      return join(homedir(), '.next-devframe-hub')
    },
  })
  const host = nextHost.host

  // Register the hub's own connection base so the hub client (app/page.tsx)
  // can discover the side-car WS via `<base>/__connection.json`; the mounted
  // devframes each register their own base through `mountDevframe`.
  host.mountConnectionMeta?.('/__hub')

  const port = options.port ?? await getPort({ host: hostName, port: 9877, random: false })

  const context = await createHubContext({
    cwd,
    workspaceRoot: cwd,
    mode: 'dev',
    host,
    builtinRpcDeclarations: [
      nextHubMessagesList,
      nextHubTerminalsList,
    ],
  })

  context.commands.register({
    id: 'example:next-devframe-hub:ping',
    title: 'Next Hub: Ping',
    icon: 'ph:bell-duotone',
    category: 'hub',
    // Opt this command into the agent surface: it shows up as an MCP tool
    // on the in-process endpoint mounted below.
    agent: {
      description: 'Ping the hub to confirm it is alive. Returns "pong". Safe to call freely.',
      safety: 'read',
    },
    handler: () => 'pong',
  })

  // The hub no longer synthesizes built-in docks — a high-level integration
  // registers the viewer's native views it wants, declaring the `~builtin`
  // category itself so this Settings tab groups and sorts last.
  context.docks.register({
    type: '~builtin',
    id: '~settings',
    title: 'Settings',
    icon: 'ph:gear-duotone',
    category: '~builtin',
  })

  // Demo devframes alongside the dogfooded built-in plugin packages.
  const devframes = options.devframes
    ?? [demoDevframe, demoDevframeB, ...await loadBuiltinPlugins(), await loadAssetsDevframe()]

  await context.messages.add({
    level: 'success',
    message: 'Next Devframe Hub started',
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

  // Dogfood the opt-in JSON-render hub integration: author a view on the hub
  // context and project it onto a `json-render` dock. The client (app/page.tsx)
  // renders it with a mini React registry (registry replacement).
  const jsonRenderView = createDashboardView(context)
  context.docks.register(toJsonRenderDockEntry(jsonRenderView, {
    id: 'example:json-render',
    title: 'JSON Render',
    icon: 'ph:layout-duotone',
    category: 'app',
  }))

  // Shared-iframe soft-navigation demo. mountDevframe serves the SPA and
  // registers its iframe dock; the `dock` override marks it a `subTabs` anchor
  // (a shared `frameId` + the postmessage protocol) so the client host attaches
  // the frame-nav adapter, materializing one client-only dock per tab the SPA's
  // shim reports — all sharing this one iframe.
  await mountDevframe(context, tabbedDevframe, {
    dock: {
      category: 'app',
      frameId: 'next-tabbed-tool',
      subTabs: { protocol: 'postmessage' },
    },
  })

  // Gate the side-car RPC/WS server instead of leaving it open: the hub owns
  // the trust boundary, so it mints a per-boot bearer token, accepts it as a
  // pre-shared `clientAuthToken`, and hands it to its own SPA through the
  // connection meta it serves (`authToken` below). `connectDevframe` presents
  // it automatically — the host authenticates its own trusted origin with no
  // code prompt, while an arbitrary connection is rejected.
  const clientAuthToken = randomToken()
  const started = await startHttpAndWs({
    context,
    host: hostName,
    port,
    auth: createInteractiveAuth(context, { clientAuthTokens: [clientAuthToken] }),
  })

  // Serve MCP in-process on the Next app's own origin (the `/_next/mcp`
  // shape): the hub's agent surface — agent-flagged commands, plugin tools
  // (git status/log/diff, terminals), `devframe:state:read` — over the same catch-all
  // route as the SPAs, no side-car port involved. `mountMcp` mints the bearer
  // token the route requires and returns it for the registry record below.
  const mcpPath = '/__hub/__mcp'
  const mcp = await nextHost.mountMcp(context, mcpPath, {
    serverName: 'example:next-devframe-hub',
  })

  const connectionMeta = {
    backend: 'websocket' as const,
    websocket: started.port,
    mcp: { path: mcpPath },
    authToken: clientAuthToken,
  }
  // Publish the live meta to the bridge now the WS port is known, so every
  // registered `<base>/__connection.json` (hub + mounted devframes) resolves.
  nextHost.setConnectionMeta(connectionMeta)

  // Record the instance in the global registry so `devframe connect`
  // discovers this hub — running inside the Next dev server — like any
  // standalone devframe. In-process hosts register explicitly; the origin is
  // the Next app's own.
  const registration = registerDevframeInstance({
    pid: process.pid,
    port: nextPort,
    origin: `http://${hostName}:${nextPort}`,
    basePath: '/__hub/',
    id: 'example:next-devframe-hub',
    name: 'Next Devframe Hub',
    rootDir: cwd,
    mcp: { path: mcpPath, token: mcp.authToken },
    startedAt: Date.now(),
  })
  const closeStarted = started.close
  started.close = async () => {
    registration.unregister()
    await mcp.dispose()
    await closeStarted()
  }

  return Object.assign(started, {
    context,
    connectionMeta,
    fetch: nextHost.fetch,
  })
}

const GLOBAL_KEY = '__nextDevframeHub'

type GlobalWithHub = typeof globalThis & {
  [GLOBAL_KEY]?: Promise<StartedNextDevframeHub>
}

export function ensureNextDevframeHub(
  options: NextDevframeHubOptions = {},
): Promise<StartedNextDevframeHub> {
  const globalHub = globalThis as GlobalWithHub
  globalHub[GLOBAL_KEY] ??= nextDevframeHub(options)
  return globalHub[GLOBAL_KEY]
}
