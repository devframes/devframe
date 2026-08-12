import type { HubDevframeEntry, HubInstance } from '@devframes/hub/initiate'
import type { DevframeHubContext } from '@devframes/hub/node'
import type { ClientScriptEntry } from '@devframes/hub/types'
import type { DevframeDefinition } from 'devframe'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { Server as NodeHttpServer } from 'node:http'
import { homedir } from 'node:os'
import { defineHubRpcFunction } from '@devframes/hub'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { join } from 'pathe'

export interface ViteDevframeHubOptions {
  /**
   * Mount base the hub answers under — every frame lives at `<base><id>/`.
   * Default: `/__devframes/`.
   */
  base?: string
  /**
   * Pin a side-car port for the RPC/WS server. By default the WebSocket
   * shares Vite's own http server, upgrading at `<base>__ws`.
   */
  port?: number
  /**
   * Devframes to mount as docks. Wrap an entry in `{ devframe, dock }` to
   * customize its synthesized iframe dock (category, `frameId`, `subTabs`, …).
   */
  devframes?: (DevframeDefinition | HubDevframeEntry)[]
  /**
   * Per-dock client scripts, keyed by devframe id. Attached to the mounted
   * iframe dock so the hub client runtime imports them into the host page
   * (e.g. the a11y inspector's in-page agent).
   */
  clientScripts?: Record<string, ClientScriptEntry>
  /**
   * Called once the hub context is created (after devframes are mounted),
   * inside `initHub`'s `configure` step. Lets the composition register extra
   * surfaces on the context — e.g. a `json-render` dock via
   * `@devframes/json-render`.
   */
  onContextReady?: (context: DevframeHubContext) => void | Promise<void>
}

// Minimal hub-local RPCs — used by the UI for read-side data. A more
// ambitious hub host might hoist these into `@devframes/hub` itself.
const viteHubMessagesList = defineHubRpcFunction({
  name: 'example:vite-devframe-hub:messages:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: DevframeHubContext) => ({
    async handler() {
      return Array.from(ctx.messages.entries.values())
    },
  }),
})

const viteHubTerminalsList = defineHubRpcFunction({
  name: 'example:vite-devframe-hub:terminals:list',
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
 * A deliberately tiny Vite plugin that wires `@devframes/hub` into a Vite
 * dev server: one `initHub()` call assembles the whole hub — every devframe
 * mounted under `<base><id>/`, one merged RPC registry on one WebSocket
 * (upgrading on Vite's own server at `<base>__ws`), and the discovery
 * endpoints (`__connection.json`, `__index.json`, `__client-imports.js`) —
 * behind one connect-style middleware that self-filters by the base.
 *
 * This file is the entire Vite host — every other framework's hub host is
 * the same shape: a thin layer that adapts a framework's dev server to the hub.
 */
export function viteDevframeHub(options: ViteDevframeHubOptions = {}): Plugin {
  const base = normalizeBase(options.base ?? DEVFRAMES_HUB_BASE)
  let viteConfig: ResolvedConfig | undefined
  let instance: HubInstance | undefined

  // Every teardown path funnels here: close the hub (WS binding / side-car,
  // its instance-registry record, and mounted frames' resources).
  const teardown = async (): Promise<void> => {
    const previous = instance
    instance = undefined
    await previous?.close().catch(() => {})
  }

  return {
    name: 'vite-devframe-hub',
    apply: 'serve',

    configResolved(config) {
      viteConfig = config
    },

    async configureServer(server: ViteDevServer) {
      // Vite re-invokes `configureServer` on each restart. Tear down the
      // previous instance so we don't leak the WS binding or leave a ghost
      // registry record behind.
      await teardown()

      const cwd = viteConfig!.root

      // Attach each configured client script to its devframe's mount entry,
      // so the hub client runtime imports it into the host page.
      const devframes = (options.devframes ?? []).map<DevframeDefinition | HubDevframeEntry>((entry) => {
        const def = 'devframe' in entry ? entry.devframe : entry
        const clientScript = options.clientScripts?.[def.id]
        if (!clientScript)
          return entry
        return 'devframe' in entry
          ? { ...entry, dock: { clientScript, ...entry.dock } }
          : { devframe: def, dock: { clientScript } }
      })

      const httpServer = server.httpServer instanceof NodeHttpServer ? server.httpServer : undefined

      const hub = initHub({
        base,
        cwd,
        // Resolved lazily — Vite knows its local URL only once listening; an
        // empty string until then defers both the auth banner and the registry
        // record to the first request, whose origin is the real dialable one.
        origin: () => {
          const resolved = server.resolvedUrls?.local?.[0]
          return resolved ? new URL(resolved).origin : ''
        },
        // Single-user localhost demo: the hub is reachable only on loopback,
        // so it opts out of the gate for a no-friction dev experience. A hub
        // reachable beyond localhost should gate (see `docs/guide/security.md`).
        auth: false,
        // Share Vite's own http server for the WebSocket upgrade at
        // `<base>__ws` — no side-car port to discover. A `port` option pins
        // a side-car server instead, and an https/http2 dev server (where
        // Vite hands us a non-`node:http` server) asks for an auto-port
        // side-car — clients discover either via `__connection.json`.
        server: httpServer,
        ...(options.port != null
          ? { ws: { port: options.port } }
          : httpServer
            ? {}
            : { ws: { sidecar: true } }),
        getStorageDir(scope) {
          if (scope === 'workspace')
            return join(cwd, '.devframe')
          if (scope === 'project')
            return join(cwd, 'node_modules/.vite-devframe-hub')
          return join(homedir(), '.vite-devframe-hub')
        },
        // List this hub in the global instance registry (`~/.devframe/instances/`)
        // so discovery tooling — `devframe connect`, the inspector's Instances
        // tab — sees it like any standalone devframe. The instance owns the
        // record: written once the first request resolves the dialable origin,
        // removed on close. `rootDir` is the Vite project root.
        register: {
          id: 'example:vite-devframe-hub',
          name: 'Vite Devframe Hub',
          rootDir: cwd,
        },
        rpcDeclarations: [
          // The minimal hub ships its own `messages:list` and `terminals:list`
          // RPCs so the UI has something to read. A full hub kit would
          // likely standardise these (alongside the built-in
          // `hub:commands:execute`) but for the demo we keep them kit-local.
          viteHubMessagesList,
          viteHubTerminalsList,
        ],
        devframes,
        async configure(ctx) {
          // Seed a sample command directly on the hub so the UI
          // shows something even without any plugged-in devframes.
          ctx.commands.register({
            id: 'example:vite-devframe-hub:ping',
            title: 'Vite Hub · Ping',
            icon: 'ph:bell-duotone',
            category: 'kit',
            handler: () => 'pong',
          })
          await ctx.messages.add({
            level: 'success',
            message: 'Vite Devframe Hub started',
            description: options.port != null
              ? `Side-car WS on port ${options.port}. ${devframes.length} devframe(s) mounted under ${base}.`
              : `WS shared on the Vite server at ${base}__ws. ${devframes.length} devframe(s) mounted under ${base}.`,
          })

          await options.onContextReady?.(ctx)
        },
      })
      instance = hub

      // One namespace, one catch-all: the middleware serves everything under
      // `base` and `next()`s the rest back to Vite.
      server.middlewares.use(hub.nodeMiddleware)

      server.httpServer?.once('close', () => {
        if (instance !== hub)
          return
        void teardown()
      })
    },

    async closeBundle() {
      await teardown()
    },
  }
}

function normalizeBase(base: string): string {
  let out = base.startsWith('/') ? base : `/${base}`
  if (!out.endsWith('/'))
    out = `${out}/`
  return out
}
