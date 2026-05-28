import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeDefinition, DevframeHost } from 'devframe/types'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { homedir } from 'node:os'
import { defineHubRpcFunction } from '@devframes/hub'
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { startHttpAndWs } from 'devframe/node'
import { serveStaticNodeMiddleware } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { join } from 'pathe'

export interface MinimalViteDevframeHubOptions {
  /** Mount path for the hub's connection-meta endpoint. Default: `/__hub/`. */
  base?: string
  /** Preferred port for the side-car RPC/WS server. Default: a free port near 9777. */
  port?: number
  /** Devframes to mount as docks. */
  devframes?: DevframeDefinition[]
}

// Minimal hub-local RPCs — used by the UI for read-side data. A more
// ambitious hub host might hoist these into `@devframes/hub` itself.
const minimalViteHubMessagesList = defineHubRpcFunction({
  name: 'minimal-vite-devframe-hub:messages:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: DevframeHubContext) => ({
    async handler() {
      return Array.from(ctx.messages.entries.values())
    },
  }),
})

const minimalViteHubTerminalsList = defineHubRpcFunction({
  name: 'minimal-vite-devframe-hub:terminals:list',
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
 * dev server: creates a hub context, implements the framework-neutral
 * `DevframeHost` surface, and exposes the side-car WS endpoint to the
 * browser via Vite middleware at `<base>__connection.json`.
 *
 * This file is the entire Vite host — every other framework's hub host is
 * the same shape: a thin layer that adapts a framework's dev server to the hub.
 */
export function minimalViteDevframeHub(options: MinimalViteDevframeHubOptions = {}): Plugin {
  const base = normalizeBase(options.base ?? '/__hub/')
  let viteConfig: ResolvedConfig | undefined
  let started: { close: () => Promise<void> } | undefined

  return {
    name: 'minimal-vite-devframe-hub',
    apply: 'serve',

    configResolved(config) {
      viteConfig = config
    },

    async configureServer(server: ViteDevServer) {
      // Vite re-invokes `configureServer` on each restart. Tear down the
      // previous server so we don't leak the WS port.
      await started?.close().catch(() => {})
      started = undefined

      const cwd = viteConfig!.root

      const host: DevframeHost = {
        mountStatic(base, distDir) {
          server.middlewares.use(base, serveStaticNodeMiddleware(distDir))
        },
        resolveOrigin() {
          const resolved = server.resolvedUrls?.local?.[0]
          return resolved ? new URL(resolved).origin : 'http://localhost:5173'
        },
        getStorageDir(scope) {
          return scope === 'workspace'
            ? join(cwd, 'node_modules/.minimal-vite-devframe-hub')
            : join(homedir(), '.minimal-vite-devframe-hub')
        },
      }

      const port = options.port ?? await getPort({ port: 9777, random: false })

      const context = await createHubContext({
        cwd,
        workspaceRoot: cwd,
        mode: 'dev',
        host,
        builtinRpcDeclarations: [
          // The minimal hub ships its own `messages:list` and `terminals:list`
          // RPCs so the UI has something to read. A full hub kit would
          // likely standardise these (alongside the built-in
          // `hub:commands:execute`) but for the demo we keep them kit-local.
          minimalViteHubMessagesList,
          minimalViteHubTerminalsList,
        ],
      })

      // Seed a sample command directly on the hub so the UI
      // shows something even without any plugged-in devframes.
      context.commands.register({
        id: 'minimal-vite-devframe-hub:ping',
        title: 'Vite Hub · Ping',
        icon: 'ph:bell-duotone',
        category: 'kit',
        handler: () => 'pong',
      })
      await context.messages.add({
        level: 'success',
        message: 'Minimal Vite Devframe Hub started',
        description: `Side-car WS on port ${port}. ${options.devframes?.length ?? 0} devframe(s) registered.`,
      })

      for (const def of options.devframes ?? []) {
        await mountDevframe(context, def)
      }

      started = await startHttpAndWs({
        context,
        port,
        auth: false,
      })

      // Tell the browser where to find the WS endpoint. `connectDevframe`
      // resolves this URL relative to its `baseURL` option.
      const metaPath = `${base}${DEVFRAME_CONNECTION_META_FILENAME}`
      server.middlewares.use(metaPath, (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ backend: 'websocket', websocket: port }))
      })

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
