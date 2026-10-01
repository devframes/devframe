import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { Http2SecureServer } from 'node:http2'
import type { ViteDevServer } from 'vite'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { createSecureServer } from 'node:http2'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPort } from 'get-port-please'
import { afterEach, describe, expect, it } from 'vitest'
import { viteDevframeHub } from '../src/hub'

type ConnectMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

/**
 * Vite on `server.https` hands plugins an `Http2SecureServer` (with
 * `allowHTTP1`), which is not a `node:http` `Server`. Requests are served
 * here over a plain HTTP server running the same middleware stack, so the
 * test needs no certificate.
 */
function fakeHttpsViteServer() {
  const stack: ConnectMiddleware[] = []
  const requestServer: NodeHttpServer = createServer((req, res) => {
    let i = 0
    const next = (): void => {
      const handler = stack[i++]
      if (!handler) {
        res.statusCode = 404
        res.end()
        return
      }
      handler(req, res, next)
    }
    next()
  })
  const httpServer: Http2SecureServer = createSecureServer({ allowHTTP1: true })
  const server = {
    httpServer,
    resolvedUrls: null,
    middlewares: { use: (handler: ConnectMiddleware) => stack.push(handler) },
  }
  return { server, httpServer, requestServer }
}

describe('viteDevframeHub', () => {
  let cleanup: (() => Promise<void>) | undefined

  afterEach(async () => {
    await cleanup?.()
    cleanup = undefined
  })

  it('shares an https (http2) dev server for the WebSocket upgrade', async () => {
    const host = '127.0.0.1'
    const port = await getPort({ port: 19800, host })
    const { server, httpServer, requestServer } = fakeHttpsViteServer()
    await new Promise<void>(resolve => requestServer.listen(port, host, resolve))

    const plugin = viteDevframeHub({
      ui: false,
      auth: false,
      quiet: true,
      cwd: mkdtempSync(join(tmpdir(), 'devframe-vite-hub-')),
    })
    cleanup = async () => {
      httpServer.emit('close')
      await (plugin.closeBundle as () => Promise<void>)()
      requestServer.close()
      requestServer.closeAllConnections()
    }
    await (plugin.configureServer as (s: ViteDevServer) => Promise<void>)(server as any)

    const res = await fetch(`http://${host}:${port}/__devframes/__connection.json`)
    const meta = await res.json() as { websocket?: unknown }
    expect(meta.websocket).toEqual({ path: '/__devframes/__ws' })
    expect(httpServer.listenerCount('upgrade')).toBe(1)
  })
})
