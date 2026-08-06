import type { HubDevframeEntry, HubInstance } from '@devframes/hub/initiate'
import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeInstanceRegistration } from 'devframe/node'
import type { DevframeDefinition } from 'devframe/types'
import { homedir } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineHubRpcFunction } from '@devframes/hub'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { toJsonRenderDockEntry } from '@devframes/json-render/hub'
import { registerDevframeInstance } from 'devframe/node'
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

/**
 * URL base the a11y agent module is served under — inside the hub namespace,
 * so the one catch-all route reaches it.
 */
const A11Y_AGENT_MOUNT_BASE = `${DEVFRAMES_HUB_BASE}df-a11y-agent/`

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
  /** Pin the side-car RPC/WS port. Default: `initHub` walks a free port near 9777. */
  port?: number
  /** Hostname for the side-car server. Default: `localhost`. */
  host?: string
  /** Workspace root used by hub host capabilities. Default: `process.cwd()`. */
  cwd?: string
  /**
   * Memoize the instance on `globalThis` under this key (`initHub`'s `key`),
   * so dev-time module re-evaluation returns the live instance instead of
   * leaking side-car servers.
   */
  key?: string
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

/**
 * The entire Next host: one `initHub()` call. The instance mounts every
 * devframe under `/__devframes/<id>/`, merges their RPC registries onto one
 * WebSocket side-car, serves the discovery endpoints (`__connection.json`,
 * `__index.json`, `__client-imports.js`) and the aggregate MCP route — all
 * behind the one web-standard `handler` the App Router catch-all delegates to.
 */
export async function nextDevframeHub(
  options: NextDevframeHubOptions = {},
): Promise<HubInstance> {
  const cwd = options.cwd ?? process.cwd()
  const hostName = options.host ?? 'localhost'
  const nextPort = Number(process.env.PORT ?? 3000)
  const origin = `http://${hostName}:${nextPort}`

  // Serve the a11y inspector's in-page agent same-origin (inside the hub
  // namespace, via the catch-all route) and attach it to the a11y dock as its
  // client script. The hub client runtime booted in `app/page.tsx` imports it
  // into the host page, where it scans this hub live; the panel iframe shares
  // the origin, so their BroadcastChannel connects.
  const a11yAgent = await loadA11yAgentMount()

  // Demo devframes alongside the dogfooded built-in plugin packages. The
  // shared-iframe soft-navigation demo mounts as a `subTabs` anchor (a shared
  // `frameId` + the postmessage protocol) so the client host attaches the
  // frame-nav adapter, materializing one client-only dock per tab the SPA's
  // shim reports — all sharing one iframe.
  const devframes: (DevframeDefinition | HubDevframeEntry)[] = [
    demoDevframe,
    demoDevframeB,
    ...(await loadBuiltinPlugins()).map<DevframeDefinition | HubDevframeEntry>(def =>
      a11yAgent && def.id === a11yAgent.dockId
        ? { devframe: def, dock: { clientScript: { importFrom: a11yAgent.importFrom } } }
        : def,
    ),
    await loadAssetsDevframe(),
    {
      devframe: tabbedDevframe,
      dock: {
        category: 'app',
        frameId: 'next-tabbed-tool',
        subTabs: { protocol: 'postmessage' },
      },
    },
  ]

  let registration: DevframeInstanceRegistration | undefined

  const hub = initHub({
    ...(options.key ? { key: options.key } : {}),
    base: DEVFRAMES_HUB_BASE,
    cwd,
    origin,
    host: hostName,
    // Single-user localhost demo: the side-car is reachable only on loopback,
    // so it opts out of the gate for a no-friction dev experience. A hub
    // reachable beyond localhost should gate (see `docs/guide/security.md`).
    auth: false,
    // The aggregate MCP endpoint at `/__devframes/__mcp` — the hub's agent
    // surface (agent-flagged commands, plugin tools, `devframe:state:read`)
    // over the same catch-all route as the SPAs.
    mcp: true,
    // Omitted `server` (Next route handlers can't accept WS upgrades), so the
    // instance starts its default eager side-car WebSocket server; a `port`
    // option pins it.
    ...(options.port != null ? { ws: { port: options.port } } : {}),
    getStorageDir(scope) {
      if (scope === 'workspace')
        return join(cwd, '.devframe')
      if (scope === 'project')
        return join(cwd, 'node_modules/.next-devframe-hub')
      return join(homedir(), '.next-devframe-hub')
    },
    rpcDeclarations: [
      nextHubMessagesList,
      nextHubTerminalsList,
    ],
    devframes,
    async configure(ctx) {
      ctx.commands.register({
        id: 'example:next-devframe-hub:ping',
        title: 'Next Hub: Ping',
        icon: 'ph:bell-duotone',
        category: 'hub',
        // Opt this command into the agent surface: it shows up as an MCP tool
        // on the aggregate endpoint at `<base>__mcp`.
        agent: {
          description: 'Ping the hub to confirm it is alive. Returns "pong". Safe to call freely.',
          safety: 'read',
        },
        handler: () => 'pong',
      })

      // The hub synthesizes no built-in docks — a high-level integration
      // registers the viewer's native views it wants, declaring the `~builtin`
      // category itself so this Settings tab groups and sorts last.
      ctx.docks.register({
        type: '~builtin',
        id: '~settings',
        title: 'Settings',
        icon: 'ph:gear-duotone',
        category: '~builtin',
      })

      if (a11yAgent)
        await ctx.host.mountStatic(A11Y_AGENT_MOUNT_BASE, a11yAgent.dir)

      // Dogfood the opt-in JSON-render hub integration: author a view on the
      // hub context and project it onto a `json-render` dock. The client
      // (app/page.tsx) renders it with a mini React registry.
      const jsonRenderView = createDashboardView(ctx)
      ctx.docks.register(toJsonRenderDockEntry(jsonRenderView, {
        id: 'example:json-render',
        title: 'JSON Render',
        icon: 'ph:layout-duotone',
        category: 'app',
      }))

      await ctx.messages.add({
        level: 'success',
        message: 'Next Devframe Hub started',
        description: `${devframes.length} devframe(s) mounted under ${DEVFRAMES_HUB_BASE}.`,
      })

      // Record the instance in the global registry so `devframe connect`
      // discovers this hub — running inside the Next dev server — like any
      // standalone devframe. In-process hosts register explicitly; the origin
      // is the Next app's own.
      registration = registerDevframeInstance({
        pid: process.pid,
        port: nextPort,
        origin,
        basePath: DEVFRAMES_HUB_BASE,
        id: 'example:next-devframe-hub',
        name: 'Next Devframe Hub',
        rootDir: cwd,
        mcp: { path: `${DEVFRAMES_HUB_BASE}__mcp` },
        startedAt: Date.now(),
      })
    },
  })

  const closeHub = hub.close
  return {
    ...hub,
    close: async () => {
      registration?.unregister()
      registration = undefined
      await closeHub()
    },
  }
}

let hubPromise: Promise<HubInstance> | undefined

/**
 * The route-facing singleton. `initHub`'s `key` memoizes the live instance on
 * `globalThis` across dev-time module re-evaluations; the module-level promise
 * just avoids re-running the plugin loading per request.
 */
export function ensureNextDevframeHub(): Promise<HubInstance> {
  hubPromise ??= nextDevframeHub({ key: 'next-devframe-hub' })
  return hubPromise
}
