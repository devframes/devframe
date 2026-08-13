import type { HubInstance } from '@devframes/hub/initiate'
import type { ClientScriptEntry } from '@devframes/hub/types'
import type { DevframeDefinition } from 'devframe'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { Server as NodeHttpServer } from 'node:http'
import { homedir } from 'node:os'
import { initHub } from '@devframes/hub/initiate'
import { join } from 'pathe'

export interface A11yMessagesPlaygroundOptions {
  /** Mount base the hub answers under. Default: `/__hub/`. */
  base?: string
  /** Pin the side-car RPC/WS port instead of sharing Vite's server / a random one. */
  port?: number
  /** Devframes to mount as docks (here: a11y + messages). */
  devframes?: DevframeDefinition[]
  /**
   * Per-dock client scripts, keyed by devframe id. Attached to the mounted
   * iframe dock so the hub client runtime imports them into the host page -
   * this is how the a11y inspector's in-page agent gets into the page it scans.
   */
  clientScripts?: Record<string, ClientScriptEntry>
}

/**
 * A tiny Vite plugin that runs `@devframes/hub` inside the Vite dev server -
 * the same shape as `examples/hub-vite`, trimmed to the two plugins this
 * playground pairs (a11y + messages). One `initHub()` call assembles the whole
 * hub: it mounts each devframe as a dock (attaching the a11y agent as its
 * client script), shares the WebSocket with Vite's own server, serves the
 * discovery endpoints, and registers the playground in the global instance
 * registry.
 */
export function a11yMessagesPlayground(options: A11yMessagesPlaygroundOptions = {}): Plugin {
  const base = normalizeBase(options.base ?? '/__hub/')
  let viteConfig: ResolvedConfig | undefined
  let hub: HubInstance | undefined

  return {
    name: 'a11y-messages-playground',
    apply: 'serve',

    configResolved(config) {
      viteConfig = config
    },

    async configureServer(server: ViteDevServer) {
      // Vite re-invokes `configureServer` on restart - tear the old hub down so
      // we don't leak the WS port or leave a ghost registry record behind.
      await hub?.close().catch(() => {})

      const cwd = viteConfig!.root
      // Share Vite's own HTTP server for the WS upgrade when it's a plain
      // `node:http` server; otherwise (a pinned port, or an https/http2 dev
      // server) fall back to a side-car. Either way the browser finds the
      // socket through `__connection.json`.
      const httpServer = server.httpServer instanceof NodeHttpServer ? server.httpServer : undefined
      const ws = options.port != null ? { port: options.port } : httpServer ? undefined : { sidecar: true as const }

      hub = initHub({
        base,
        cwd,
        auth: false,
        ...(options.port == null && httpServer ? { server: httpServer } : {}),
        ...(ws ? { ws } : {}),
        getStorageDir(scope) {
          if (scope === 'workspace')
            return join(cwd, '.devframe')
          if (scope === 'project')
            return join(cwd, 'node_modules/.a11y-messages-playground')
          return join(homedir(), '.a11y-messages-playground')
        },
        devframes: (options.devframes ?? []).map((def) => {
          const clientScript = options.clientScripts?.[def.id]
          return clientScript ? { devframe: def, dock: { clientScript } } : def
        }),
        // List the playground alongside standalone devframes in discovery
        // tooling (`devframe connect`, the inspector's Instances tab).
        register: {
          id: 'example:a11y-messages-playground',
          name: 'A11y + Messages Playground',
        },
      })

      server.middlewares.use(hub.nodeMiddleware)

      server.httpServer?.once('close', () => {
        void hub?.close().catch(() => {})
        hub = undefined
      })
    },

    async closeBundle() {
      await hub?.close().catch(() => {})
      hub = undefined
    },
  }
}

function normalizeBase(base: string): string {
  let out = base.startsWith('/') ? base : `/${base}`
  if (!out.endsWith('/'))
    out = `${out}/`
  return out
}
