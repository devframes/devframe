import type { HubInstance } from '@devframes/hub/initiate'
import type { Plugin, ViteDevServer } from 'vite'
import { Server as NodeHttpServer } from 'node:http'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import gitDevframe from '@devframes/plugin-git'
import { PLAYGROUND_GROUP_ID } from './constants'
import { seedPlayground } from './seed'

/**
 * Mounts a bare, headless hub instance as Vite dev-server middleware — just
 * enough backend for `main.ts`'s `DockStandalone`/`DockEmbedded` to connect
 * to (RPC, WebSocket, `__connection.json`), plus a real mounted devframe (the
 * Git dashboard, below) so the dock bar has real content to switch between,
 * not just the client-only entries `seed.ts` registers. No `ui` slot, no
 * renderer manifest: this playground is developing hub-ui itself, not
 * exercising the wider hub protocol (`examples/hub-vite` already does that).
 *
 * A hand-rolled slice of `@devframes/vite/hub` rather than that package
 * itself — pulling it in here would make `@devframes/hub-ui` and
 * `@devframes/vite` depend on each other (`@devframes/vite` already carries
 * an optional peer dependency on `@devframes/hub-ui` for its own default UI
 * slot), a cyclic workspace dependency for no real benefit.
 *
 * `@devframes/plugin-git` is the one built-in plugin that doesn't itself
 * depend on `@devframes/vite` (every other plugin does, for its own
 * dev-spa/build tooling) — mounting any of those here would reintroduce the
 * same cyclic dependency `@devframes/vite/hub` avoids, just one hop further
 * out (hub-ui → that plugin → `@devframes/vite` → hub-ui again, via its peer
 * dependency).
 */
export function hubUiPlaygroundHub(): Plugin {
  let instance: HubInstance | undefined

  const teardown = async (): Promise<void> => {
    const previous = instance
    instance = undefined
    await previous?.close().catch(() => {})
  }

  return {
    name: 'hub-ui-playground:hub',
    apply: 'serve',

    async configureServer(server: ViteDevServer) {
      // Vite re-invokes `configureServer` on each restart.
      await teardown()

      const httpServer = server.httpServer instanceof NodeHttpServer ? server.httpServer : undefined
      const hub = initHub({
        base: DEVFRAMES_HUB_BASE,
        // Storage (if anything writes to it) lands under this package's own
        // `node_modules`, not the playground folder.
        cwd: new URL('..', import.meta.url).pathname,
        origin: () => {
          const resolved = server.resolvedUrls?.local?.[0]
          return resolved ? new URL(resolved).origin : ''
        },
        // Frictionless local loop — no interactive OTP gate.
        auth: false,
        // Share Vite's own HTTP server for the WS upgrade, like
        // `@devframes/vite/hub` does.
        server: httpServer,
        ...(httpServer ? {} : { ws: { sidecar: true } }),
        // Collapsed under the "Playground Tools" group `seed.ts`'s
        // `configure` registers below, alongside the "Ping" action. Read-only
        // (`write` stays unset) — this is a throwaway dev loop, not somewhere
        // to stage/commit from. Inspects this very checkout: `cwd` above is
        // this package's own directory.
        devframes: [
          { devframe: gitDevframe, dock: { groupId: PLAYGROUND_GROUP_ID } },
        ],
        configure: seedPlayground,
      })
      instance = hub

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
