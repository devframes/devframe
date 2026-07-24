import type { DevframeHubContext } from '@devframes/hub/node'
import type { ClientScriptEntry } from '@devframes/hub/types'
import type { DevframeDefinition, DevframeHost } from 'devframe/types'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { homedir } from 'node:os'
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { startHttpAndWs } from 'devframe/node'
import { serveStaticNodeMiddleware } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { join } from 'pathe'

export interface A11yMessagesPlaygroundOptions {
  /** Mount path for the hub's connection-meta endpoint. Default: `/__hub/`. */
  base?: string
  /** Preferred port for the side-car RPC/WS server. Default: a free port near 9878. */
  port?: number
  /** Devframes to mount as docks (here: a11y + messages). */
  devframes?: DevframeDefinition[]
  /**
   * Per-dock client scripts, keyed by devframe id. Attached to the mounted
   * iframe dock so the hub client runtime imports them into the host page —
   * this is how the a11y inspector's in-page agent gets into the page it scans.
   */
  clientScripts?: Record<string, ClientScriptEntry>
}

/**
 * A tiny Vite plugin that runs `@devframes/hub` inside the Vite dev server —
 * the same shape as `examples/minimal-vite-devframe-hub`, trimmed to the two
 * plugins this playground pairs (a11y + messages). It creates a hub context,
 * implements the framework-neutral `DevframeHost` surface, mounts each devframe
 * as a dock (attaching the a11y agent as its client script), and exposes the
 * side-car WS endpoint at `<base>__connection.json`.
 */
export function a11yMessagesPlayground(options: A11yMessagesPlaygroundOptions = {}): Plugin {
  const base = normalizeBase(options.base ?? '/__hub/')
  let viteConfig: ResolvedConfig | undefined
  let started: { close: () => Promise<void> } | undefined

  return {
    name: 'a11y-messages-playground',
    apply: 'serve',

    configResolved(config) {
      viteConfig = config
    },

    async configureServer(server: ViteDevServer) {
      // Vite re-invokes `configureServer` on restart — tear the old server down
      // so we don't leak the WS port.
      await started?.close().catch(() => {})
      started = undefined

      const cwd = viteConfig!.root
      const port = options.port ?? await getPort({ port: 9878, portRange: [9878, 9978] })

      const serveConnectionMeta = (metaBase: string): void => {
        const metaPath = `${metaBase}${DEVFRAME_CONNECTION_META_FILENAME}`
        server.middlewares.use(metaPath, (_req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ backend: 'websocket', websocket: port }))
        })
      }

      const host: DevframeHost = {
        mountStatic(base, distDir) {
          server.middlewares.use(base, serveStaticNodeMiddleware(distDir))
        },
        mountConnectionMeta(base) {
          serveConnectionMeta(base)
        },
        resolveOrigin() {
          const resolved = server.resolvedUrls?.local?.[0]
          return resolved ? new URL(resolved).origin : 'http://localhost:5173'
        },
        getStorageDir(scope) {
          if (scope === 'workspace')
            return join(cwd, '.devframe')
          if (scope === 'project')
            return join(cwd, 'node_modules/.a11y-messages-playground')
          return join(homedir(), '.a11y-messages-playground')
        },
      }

      const context: DevframeHubContext = await createHubContext({
        cwd,
        workspaceRoot: cwd,
        mode: 'dev',
        host,
      })

      // Mount each devframe as a dock, attaching its client script when one is
      // configured (the a11y agent). `mountDevframe` runs the def's `setup(ctx)`,
      // so `setupA11y` / `setupMessages` register their RPCs automatically.
      for (const def of options.devframes ?? []) {
        const clientScript = options.clientScripts?.[def.id]
        await mountDevframe(context, def, clientScript ? { dock: { clientScript } } : undefined)
      }

      started = await startHttpAndWs({ context, port, auth: false })

      // Tell the hub UI (served at `base`) where to find the WS endpoint.
      serveConnectionMeta(base)

      server.httpServer?.once('close', () => {
        void started?.close().catch(() => {})
      })
    },

    async closeBundle() {
      await started?.close().catch(() => {})
      started = undefined
    },
  }
}

function normalizeBase(base: string): string {
  let out = base.startsWith('/') ? base : `/${base}`
  if (!out.endsWith('/'))
    out = `${out}/`
  return out
}
