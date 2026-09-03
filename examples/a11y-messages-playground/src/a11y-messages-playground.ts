import type { HubInstance } from '@devframes/hub/initiate'
import type { DevframeDefinition, DevframeStorageScope } from 'devframe'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { Server as NodeHttpServer } from 'node:http'
import { homedir } from 'node:os'
import { buildHub } from '@devframes/hub/build'
import { initHub } from '@devframes/hub/initiate'
import { join, resolve } from 'pathe'

export interface A11yMessagesPlaygroundOptions {
  /** Mount base the hub answers under. Default: `/__hub/`. */
  base?: string
  /** Pin the side-car RPC/WS port instead of sharing Vite's server / a random one. */
  port?: number
  /** Devframes to mount as docks (here: a11y + messages). */
  devframes?: DevframeDefinition[]
}

/**
 * A tiny Vite plugin that runs `@devframes/hub` inside the Vite dev server -
 * the same shape as `examples/hub-vite`, trimmed to the two plugins this
 * playground pairs (a11y + messages). One `initHub()` call assembles the whole
 * hub: it mounts each devframe as a dock, shares the WebSocket with Vite's own
 * server, serves the discovery endpoints, and registers the playground in the
 * global instance registry.
 */
export function a11yMessagesPlayground(options: A11yMessagesPlaygroundOptions = {}): Plugin {
  const base = normalizeBase(options.base ?? '/__hub/')
  let viteConfig: ResolvedConfig | undefined
  let hub: HubInstance | undefined

  const storageDirs = (cwd: string) => (scope: DevframeStorageScope): string => {
    if (scope === 'workspace')
      return join(cwd, '.devframe')
    if (scope === 'project')
      return join(cwd, 'node_modules/.a11y-messages-playground')
    return join(homedir(), '.a11y-messages-playground')
  }

  return {
    name: 'a11y-messages-playground',

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
        getStorageDir: storageDirs(cwd),
        devframes: options.devframes ?? [],
        /**
         * List the playground alongside standalone devframes in discovery
         * tooling (`devframe connect`, the inspector's Instances tab).
         */
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

      // Production build: bake the whole hub statically into the app's dist
      // (`<outDir><base>`), so the built page works from any static file
      // server - the a11y page script still loads, its in-page channel still
      // scans, and the panels boot from the baked RPC dump.
      if (viteConfig?.command !== 'build')
        return
      const cwd = viteConfig.root
      await buildHub({
        base,
        cwd,
        outDir: join(resolve(cwd, viteConfig.build.outDir), base.slice(1)),
        getStorageDir: storageDirs(cwd),
        devframes: options.devframes ?? [],
        async configure(ctx) {
          // Bake one demo entry into the static feed snapshot; its activate
          // action exercises the message → dock navigation, which rides a
          // same-origin BroadcastChannel on the static backend.
          await ctx.messages.add({
            message: 'Static hub build',
            description: 'This feed is a build-time snapshot; live entries need the dev server.',
            level: 'info',
            category: 'hub',
            actions: [{
              id: 'open-a11y',
              label: 'Open a11y inspector',
              kind: 'activate',
              activate: { dockId: 'devframes_plugin_a11y' },
            }],
          })
        },
      })
    },
  }
}

function normalizeBase(base: string): string {
  let out = base.startsWith('/') ? base : `/${base}`
  if (!out.endsWith('/'))
    out = `${out}/`
  return out
}
