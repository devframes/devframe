import { createContextRpcServer } from 'devframe/internal'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { attachDenoWsTransport } from 'devframe/rpc/transports/ws-deno'
import { hostPage, hub } from './hub'

// `Deno` is a global on the Deno runtime only; this is the Deno entry. Declare
// the slice this file uses so `tsc` (Node types only, no Deno lib) can check
// it — typing the handler's params here also keeps them from being `any`.
declare const Deno: {
  serve: (
    options: { port: number, hostname?: string },
    handler: (request: Request, info: unknown) => Response | Promise<Response>,
  ) => { finished: Promise<void>, shutdown: () => Promise<void>, addr: { port: number } }
  env: { get: (key: string) => string | undefined }
}

/**
 * The Deno entry. Deno serves HTTP through `Deno.serve(options, handler)` (web
 * Request → Response), but WebSockets arrive as fetch upgrades rather than
 * `node:http` `upgrade` events — so this host binds Deno's own transport to
 * the hub context with two public primitives: `createContextRpcServer` (the
 * session/auth wiring every devframe transport shares) and
 * `attachDenoWsTransport` (crossws' Deno adapter). crossws attaches the socket
 * to the `Response` its `handleUpgrade` returns, so there is no separate
 * websocket handler object to register.
 *
 * The hub advertises `/__devframes/__ws` on the app's own origin, so the
 * browser client needs no per-runtime knowledge — this file only has to
 * answer that route.
 */
export async function startDenoServer(port: number): Promise<{ port: number, close: () => Promise<void> }> {
  await hub.ready
  const context = await hub.context
  // Bind the same interactive-OTP handler the gated `initHub` uses to Deno's
  // own WS transport, sharing the context's auth storage and one-time code so
  // a client authorizes once regardless of which surface serves it.
  const core = createContextRpcServer({ context, auth: createInteractiveAuth(context) })
  const tier = await attachDenoWsTransport(core)
  const upgradePath = `${hub.base}__ws`
  const baseNoSlash = hub.base.replace(/\/$/, '')

  const server = Deno.serve({ port, hostname: '0.0.0.0' }, (request, info) => {
    const { pathname } = new URL(request.url)
    if (pathname === upgradePath && request.headers.get('upgrade')?.toLowerCase() === 'websocket')
      return tier.handleUpgrade(request, info)
    // The whole hub namespace behind one delegation — frame SPAs,
    // __connection.json, __index.json, embedded.js, __client-imports.js.
    if (pathname === baseNoSlash || pathname.startsWith(hub.base))
      return hub.handler(request)
    if (pathname === '/')
      return new Response(hostPage, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    return new Response('Not found', { status: 404 })
  })

  return {
    port: server.addr.port,
    close: async () => {
      await tier.close()
      await hub.close()
      await server.shutdown()
    },
  }
}

if (import.meta.main) {
  void startDenoServer(Number(Deno.env.get('PORT') ?? 5182)).then(({ port }) => {
    // eslint-disable-next-line no-console
    console.log(`deno-devframe-hub on http://localhost:${port} — devtools at /__devframes/`)
  })
}
