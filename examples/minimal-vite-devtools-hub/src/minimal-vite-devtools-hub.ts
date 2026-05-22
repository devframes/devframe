import type { HubHostCapabilities, HubNodeContext } from '@devframes/hub/node'
import type { DevframeDefinition, DevToolsHost } from 'devframe/types'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { homedir } from 'node:os'
import { defineRpcFunction } from '@devframes/hub'
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import { DEVTOOLS_CONNECTION_META_FILENAME } from 'devframe/constants'
import { startHttpAndWs } from 'devframe/node'
import { launchEditor } from 'devframe/utils/launch-editor'
import { getPort } from 'get-port-please'
import { join } from 'pathe'

export interface MinimalViteDevToolsHubOptions {
  /** Mount path for the hub's connection-meta endpoint. Default: `/__hub/`. */
  base?: string
  /** Preferred port for the side-car RPC/WS server. Default: a free port near 9777. */
  port?: number
  /** Devframes to mount as docks. */
  devframes?: DevframeDefinition[]
}

// Minimal hub-local RPCs — used by the UI for read-side data. A more
// ambitious hub host might hoist these into `@devframes/hub` itself.
const minimalViteHubMessagesList = defineRpcFunction({
  name: 'minimal-vite-devtools-hub:messages:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: HubNodeContext) => ({
    async handler() {
      return Array.from(ctx.messages.entries.values())
    },
  }),
})

const minimalViteHubTerminalsList = defineRpcFunction({
  name: 'minimal-vite-devtools-hub:terminals:list',
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

/**
 * A deliberately tiny Vite plugin that wires `@devframes/hub` into a Vite
 * dev server: creates a hub context, implements the host capabilities
 * (`openPath` via launch-editor), and exposes the side-car WS endpoint
 * to the browser via Vite middleware at `<base>__connection.json`.
 *
 * This file is the entire Vite host — every other framework's hub host is
 * the same shape: a thin layer that adapts a framework's dev server to the hub.
 */
export function minimalViteDevToolsHub(options: MinimalViteDevToolsHubOptions = {}): Plugin {
  const base = normalizeBase(options.base ?? '/__hub/')
  let viteConfig: ResolvedConfig | undefined
  let started: { close: () => Promise<void> } | undefined

  return {
    name: 'minimal-vite-devtools-hub',
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

      const host: DevToolsHost & HubHostCapabilities = {
        mountStatic() {
          // Static mounting for devframe SPAs would route through Vite's
          // middleware in a fuller kit. This minimal example doesn't
          // host any per-devframe SPA, so the no-op is honest.
        },
        resolveOrigin() {
          const resolved = server.resolvedUrls?.local?.[0]
          return resolved ? new URL(resolved).origin : 'http://localhost:5173'
        },
        getStorageDir(scope) {
          return scope === 'workspace'
            ? join(cwd, 'node_modules/.minimal-vite-devtools-hub')
            : join(homedir(), '.minimal-vite-devtools-hub')
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

      const port = options.port ?? await getPort({ port: 9777, random: false })

      const context = await createHubContext({
        cwd,
        workspaceRoot: cwd,
        mode: 'dev',
        host,
        builtinRpcDeclarations: [
          // The minimal hub ships its own `messages:list` and `terminals:list`
          // RPCs so the UI has something to read. A full hub kit would
          // likely standardise these (this is why hub-level RPC built-ins
          // exist — see hub:open-path / hub:commands:execute) but for the
          // demo we keep them kit-local.
          minimalViteHubMessagesList,
          minimalViteHubTerminalsList,
        ],
      })

      // Seed a sample command directly on the hub so the UI
      // shows something even without any plugged-in devframes.
      context.commands.register({
        id: 'minimal-vite-devtools-hub:ping',
        title: 'Vite Hub · Ping',
        icon: 'ph:bell-duotone',
        category: 'kit',
        handler: () => 'pong',
      })
      await context.messages.add({
        level: 'success',
        message: 'Minimal Vite DevTools Hub started',
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
      const metaPath = `${base}${DEVTOOLS_CONNECTION_META_FILENAME}`
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
