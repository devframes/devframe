import process from 'node:process'
import { createContextRpcServer } from 'devframe/internal'
import { attachBunWsTransport } from 'devframe/rpc/transports/ws-bun'
import { app, hub } from './app'

// `Bun` is a global on the Bun runtime only; this is the Bun entry. Declare the
// slice this file uses so `tsc` (Node types only, no `@types/bun`) can check it
// — typing the `fetch` callback's params here is also what keeps them from
// being implicitly `any`.
declare const Bun: {
  serve: (options: {
    port: number
    fetch: (request: Request, server: unknown) => Response | Promise<Response>
    websocket: unknown
  }) => { readonly port: number, stop: (closeActiveConnections?: boolean) => void }
}

/**
 * The Bun entry. Bun serves HTTP through the same `app.fetch` as Node, but
 * WebSockets arrive as fetch upgrades rather than `node:http` `upgrade`
 * events — so instead of `hub.attach(server)` this host binds Bun's own
 * transport to the hub's context with two public primitives:
 * `createContextRpcServer` (the session/auth wiring every devframe transport
 * shares) and `attachBunWsTransport` (crossws' Bun adapter).
 *
 * The hub advertises `/__devframes/__ws` on the app's own origin either way,
 * so the browser client needs no per-runtime knowledge — this file only has
 * to answer that route.
 */
export async function startBunServer(port: number): Promise<{ port: number, close: () => Promise<void> }> {
  await hub.ready
  const context = await hub.context
  // Matches `app.ts`'s `auth: false` — this single-user localhost demo owns
  // its trust boundary. A gated host passes the same handler it gave `initHub`.
  const core = createContextRpcServer({ context, auth: false })
  const tier = await attachBunWsTransport(core)
  const upgradePath = `${hub.base}__ws`

  const server = Bun.serve({
    port,
    fetch(request, bunServer) {
      const { pathname } = new URL(request.url)
      if (pathname === upgradePath && request.headers.get('upgrade')?.toLowerCase() === 'websocket')
        return tier.handleUpgrade(request, bunServer) as Promise<Response>
      return app.fetch(request)
    },
    websocket: tier.websocket as never,
  })

  return {
    port: server.port,
    close: async () => {
      await tier.close()
      await hub.close()
      server.stop(true)
    },
  }
}

if (import.meta.main) {
  void startBunServer(Number(process.env.PORT ?? 5179)).then(({ port }) => {
    // eslint-disable-next-line no-console
    console.log(`hono-devframe-hub (bun) on http://localhost:${port} — devtools at /__devframes/`)
  })
}
