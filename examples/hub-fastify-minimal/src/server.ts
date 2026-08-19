import process from 'node:process'
import middie from '@fastify/middie'
import Fastify from 'fastify'
import { hostPage, hub } from './hub'

// Fastify is the connect-middleware host: rather than bridging every request
// to `hub.handler` (web Request → Response), it registers `hub.nodeMiddleware`
// — the same `(req, res, next)` shape a Vite dev server consumes — through
// `@fastify/middie`. Requests under `/__devframes/` are served by the hub;
// everything else falls through `next()` to Fastify's own routes.
//
// The RPC socket rides Fastify's own `node:http` server: `fastify.server` is
// that server, and `hub.attach(server)` routes its `upgrade` events to
// `/__devframes/__ws` on the app's origin — no side-car port to discover.
export async function startFastifyServer(port: number): Promise<{ port: number, close: () => Promise<void> }> {
  const app = Fastify()
  await app.register(middie)
  app.use(hub.nodeMiddleware)

  app.get('/', (_request, reply) => {
    reply.type('text/html').send(hostPage)
  })

  const detach = hub.attach(app.server)
  await app.listen({ port, host: '0.0.0.0' })
  const address = app.server.address()
  const boundPort = typeof address === 'object' && address ? address.port : port

  return {
    port: boundPort,
    close: async () => {
      detach()
      await hub.close()
      await app.close()
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 5183)
  void startFastifyServer(port).then(({ port }) => {
    // eslint-disable-next-line no-console
    console.log(`fastify-devframe-hub on http://localhost:${port} — devtools at /__devframes/`)
  })
  process.on('SIGINT', () => process.exit(0))
}
