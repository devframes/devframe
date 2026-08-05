import type { DevframeHubContext } from '@devframes/hub/node'
import type { ClientScriptEntry } from '@devframes/hub/types'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { DevframeInstanceRegistration, StartedServer } from 'devframe/node'
import type { DevframeDefinition, DevframeHost } from 'devframe/types'
import { homedir } from 'node:os'
import process from 'node:process'
import { defineHubRpcFunction } from '@devframes/hub'
import { createHubContext, mountDevframe } from '@devframes/hub/node'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { registerDevframeInstance, startHttpAndWs } from 'devframe/node'
import { serveStaticNodeMiddleware } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { join } from 'pathe'

export interface RsbuildDevframeHubOptions {
  /** Mount path for the hub's connection-meta endpoint. Default: `/__hub/`. */
  base?: string
  /** Preferred port for the side-car RPC/WS server. Default: a free port near 9787. */
  port?: number
  /** Devframes to mount as docks. */
  devframes?: DevframeDefinition[]
  /**
   * Per-dock client scripts, keyed by devframe id. Attached to the mounted
   * iframe dock so the hub client runtime imports them into the host page
   * (e.g. the a11y inspector's in-page agent).
   */
  clientScripts?: Record<string, ClientScriptEntry>
  /**
   * Called once the hub context is created (after devframes are mounted),
   * before the server starts. Lets the composition register extra surfaces on
   * the context — e.g. a `json-render` dock via `@devframes/json-render`.
   */
  onContextReady?: (context: DevframeHubContext) => void | Promise<void>
}

// Minimal hub-local RPCs — used by the UI for read-side data. A more
// ambitious hub host might hoist these into `@devframes/hub` itself.
const rsbuildHubMessagesList = defineHubRpcFunction({
  name: 'example:rsbuild-devframe-hub:messages:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: DevframeHubContext) => ({
    async handler() {
      return Array.from(ctx.messages.entries.values())
    },
  }),
})

const rsbuildHubTerminalsList = defineHubRpcFunction({
  name: 'example:rsbuild-devframe-hub:terminals:list',
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
 * A deliberately tiny Rsbuild plugin that wires `@devframes/hub` into an
 * Rsbuild dev server: creates a hub context, implements the framework-neutral
 * `DevframeHost` surface, and exposes the side-car WS endpoint to the browser
 * via connect middleware at `<base>__connection.json`.
 *
 * This file is the entire Rsbuild host — every other framework's hub host is
 * the same shape: a thin layer that adapts a framework's dev server to the hub.
 * Because `rsbuild.config.ts` runs in Node (not through Rspack), the built-in
 * plugins are imported directly here, exactly like the Vite host — none of
 * Next's bundler-ignored dynamic `import()` dance is needed.
 */
export function rsbuildDevframeHub(options: RsbuildDevframeHubOptions = {}): RsbuildPlugin {
  const base = normalizeBase(options.base ?? '/__hub/')

  return {
    name: 'rsbuild-devframe-hub',

    setup(api) {
      let started: StartedServer | undefined
      let registration: DevframeInstanceRegistration | undefined

      const teardown = async (): Promise<void> => {
        registration?.unregister()
        registration = undefined
        await started?.close().catch(() => {})
        started = undefined
      }

      // `onBeforeStartDevServer` runs before Rsbuild registers its own
      // middlewares, so the routes added here take precedence — the hub's
      // `<base>__connection.json` and every mounted SPA under `/__<id>/` are
      // served before Rsbuild's history-API fallback can claim them.
      api.onBeforeStartDevServer(async ({ server }) => {
        // Tear down any previous server first (a config edit restarts the dev
        // server) so we neither leak the WS port nor leave a ghost registry
        // record behind.
        await teardown()

        const cwd = api.context.rootPath
        // Prefer 9787 but keep booting when it's taken (e.g. a lingering
        // previous instance) — walk the range, then fall back to a random free
        // port. Clients discover whatever was chosen via `__connection.json`.
        const port = options.port ?? await getPort({ port: 9787, portRange: [9787, 9887] })

        // Serve the side-car's connection meta (`__connection.json`) at a URL
        // base so a browser loaded there can discover the WS endpoint via
        // `connectDevframe()`'s relative `./__connection.json` fetch.
        const serveConnectionMeta = (metaBase: string): void => {
          const metaPath = `${metaBase}${DEVFRAME_CONNECTION_META_FILENAME}`
          server.middlewares.use(metaPath, (_req, res) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ backend: 'websocket', websocket: port }))
          })
        }

        // Rsbuild resolves the dev server port before listening, so it is known
        // here — the origin the browser loads the hub from, and the origin the
        // mounted SPAs' relative asset URLs resolve against.
        const origin = `http://localhost:${server.port}`

        const host: DevframeHost = {
          mountStatic(base, distDir) {
            server.middlewares.use(base, serveStaticNodeMiddleware(distDir))
          },
          // Serve `<base>__connection.json` for each mounted devframe so its
          // SPA connects to the hub without relying on same-origin parent-window
          // inheritance — which breaks for cross-origin / sandboxed iframes.
          mountConnectionMeta(base) {
            serveConnectionMeta(base)
          },
          resolveOrigin() {
            return origin
          },
          getStorageDir(scope) {
            if (scope === 'workspace')
              return join(cwd, '.devframe')
            if (scope === 'project')
              return join(cwd, 'node_modules/.rsbuild-devframe-hub')
            return join(homedir(), '.rsbuild-devframe-hub')
          },
        }

        const context = await createHubContext({
          cwd,
          workspaceRoot: cwd,
          mode: 'dev',
          host,
          builtinRpcDeclarations: [
            // The minimal hub ships its own `messages:list` and `terminals:list`
            // RPCs so the UI has something to read. A full hub kit would likely
            // standardise these (alongside the built-in `hub:commands:execute`)
            // but for the demo we keep them kit-local.
            rsbuildHubMessagesList,
            rsbuildHubTerminalsList,
          ],
        })

        // Seed a sample command directly on the hub so the UI shows something
        // even without any plugged-in devframes.
        context.commands.register({
          id: 'example:rsbuild-devframe-hub:ping',
          title: 'Rsbuild Hub · Ping',
          icon: 'ph:bell-duotone',
          category: 'kit',
          handler: () => 'pong',
        })
        await context.messages.add({
          level: 'success',
          message: 'Rsbuild Devframe Hub started',
          description: `Side-car WS on port ${port}. ${options.devframes?.length ?? 0} devframe(s) registered.`,
        })

        for (const def of options.devframes ?? []) {
          const clientScript = options.clientScripts?.[def.id]
          await mountDevframe(context, def, clientScript ? { dock: { clientScript } } : undefined)
        }

        await options.onContextReady?.(context)

        started = await startHttpAndWs({
          context,
          port,
          // Single-user localhost demo: the side-car is reachable only on
          // loopback, so it opts out of the gate for a no-friction dev
          // experience. A hub reachable beyond localhost should gate (see
          // `docs/guide/security.md`).
          auth: false,
        })

        // Tell the hub UI (served at `base`) where to find the WS endpoint.
        serveConnectionMeta(base)

        // Record this hub in the global instance registry (`~/.devframe/instances/`)
        // so discovery tooling — `devframe connect` and the inspector's Instances
        // tab — lists it like any standalone devframe. `createDevServer` registers
        // automatically; an in-process host like this one registers explicitly,
        // reusing the Rsbuild dev server's own origin (where `<base>__connection.json`
        // is served).
        const url = new URL(origin)
        registration = registerDevframeInstance({
          pid: process.pid,
          port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
          origin,
          basePath: base,
          id: 'example:rsbuild-devframe-hub',
          name: 'Rsbuild Devframe Hub',
          rootDir: cwd,
          mcp: null,
          startedAt: Date.now(),
        })
      })

      api.onCloseDevServer(teardown)
    },
  }
}

function normalizeBase(base: string): string {
  let out = base.startsWith('/') ? base : `/${base}`
  if (!out.endsWith('/'))
    out = `${out}/`
  return out
}
