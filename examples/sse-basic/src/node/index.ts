import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'

/**
 * The whole devframe: two RPC functions and a shared-state clock. `ws: false`
 * (set where this is mounted) makes it SSE-only - the instance binds no
 * WebSocket, advertises `backend: 'sse'`, and every RPC frame rides plain HTTP
 * at `<base>__sse`.
 */
export default defineDevframe({
  id: 'sse-basic',
  name: 'SSE Basic',
  version: '0.0.0',
  packageName: 'sse-basic',
  homepage: 'https://github.com/devframes/devframe/tree/main/examples/sse-basic',
  description: 'Minimal SSE-only devframe.',
  /** The built SPA the playground host serves alongside the SSE RPC. */
  clientAssets: fileURLToPath(new URL('../../dist/client', import.meta.url)),
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
    // event stream - the server→client half of the transport.
    const clock = await ctx.rpc.sharedState.get<{ now: string }>('sse-basic:clock', {
      initialValue: { now: new Date().toLocaleTimeString() },
    })
    const timer = setInterval(() => {
      clock.mutate(() => ({ now: new Date().toLocaleTimeString() }))
    }, 1000)
    timer.unref?.()
  },
})
