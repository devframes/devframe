import { defineDevframe } from 'devframe'
import { initDevframe } from 'devframe/initiate'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../alias'

// The whole devframe: two RPC functions and a shared-state clock. `ws: false`
// makes it SSE-only — the instance binds no WebSocket, advertises
// `backend: 'sse'`, and every RPC frame rides plain HTTP at `<base>__sse`.
const devframe = defineDevframe({
  id: 'sse-basic',
  name: 'SSE Basic',
  version: '0.0.0',
  packageName: 'sse-basic',
  homepage: 'https://github.com/devframes/devframe/tree/main/examples/sse-basic',
  description: 'Minimal SSE-only devframe.',
  async setup(ctx) {
    const startedAt = Date.now()
    ctx.rpc.register({
      name: 'sse-basic:uptime',
      type: 'query',
      jsonSerializable: true,
      handler: () => Math.round((Date.now() - startedAt) / 1000),
    })

    let count = 0
    ctx.rpc.register({
      name: 'sse-basic:increment',
      type: 'action',
      jsonSerializable: true,
      handler: () => ++count,
    })

    // A server-driven clock: each tick streams to every client over the SSE
    // event stream — the server→client half of the transport.
    const clock = await ctx.rpc.sharedState.get<{ now: string }>('sse-basic:clock', {
      initialValue: { now: new Date().toLocaleTimeString() },
    })
    const timer = setInterval(() => {
      clock.mutate(() => ({ now: new Date().toLocaleTimeString() }))
    }, 1000)
    timer.unref?.()
  },
})

export default defineConfig({
  resolve: { alias },
  server: { allowedHosts: true, strictPort: false },
  plugins: [
    UnoCSS(),
    {
      name: 'sse-basic:devframe',
      apply: 'serve',
      configureServer(server) {
        // No upgrade wiring anywhere: the instance mounts as ordinary HTTP
        // middleware and that alone serves discovery, auth, and all RPC.
        const instance = initDevframe(devframe, {
          base: '/__sse-basic/',
          ws: false,
          // Single-user localhost demo; a server reachable beyond localhost
          // should gate (see docs/guide/security.md).
          auth: false,
        })
        server.middlewares.use(instance.nodeMiddleware)
        server.httpServer?.once('close', () => {
          void instance.close().catch(() => {})
        })
      },
    },
  ],
})
