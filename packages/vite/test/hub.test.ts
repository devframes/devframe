import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Http2SecureServer } from 'node:http2'
import type { Socket } from 'node:net'
import type { ViteDevServer } from 'vite'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createSecureServer } from 'node:http2'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { viteDevframeHub } from '../src/hub'

type ConnectMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

function hasOpenssl(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' })
    return true
  }
  catch {
    return false
  }
}

const opensslAvailable = hasOpenssl()
if (!opensslAvailable)
  console.warn('[vite hub test] openssl not found, skipping the https dev server test')

/**
 * Vite on `server.https` hands plugins an `Http2SecureServer` with
 * `allowHTTP1`, which is not a `node:http` `Server`. This one runs the
 * plugin's connect middlewares like Vite does.
 */
function fakeHttpsViteServer(tls: { key: string, cert: string }) {
  const stack: ConnectMiddleware[] = []
  const httpServer: Http2SecureServer = createSecureServer({ ...tls, allowHTTP1: true })
  httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
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
  const sockets = new Set<Socket>()
  httpServer.on('secureConnection', (socket: Socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  const server = {
    httpServer,
    resolvedUrls: null,
    middlewares: { use: (handler: ConnectMiddleware) => stack.push(handler) },
  }
  const close = async (): Promise<void> => {
    for (const socket of sockets)
      socket.destroy()
    await new Promise<void>(resolve => httpServer.close(() => resolve()))
  }
  return { server, httpServer, close }
}

function getInsecure(url: string): Promise<{ status: number, body: string }> {
  return new Promise((resolve, reject) => {
    request(url, { rejectUnauthorized: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => body += chunk)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    }).on('error', reject).end()
  })
}

function openWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

describe.skipIf(!opensslAvailable)('viteDevframeHub', () => {
  let tls: { key: string, cert: string }
  let cleanup: (() => Promise<void>) | undefined

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'devframe-vite-hub-tls-'))
    const keyPath = join(dir, 'key.pem')
    const certPath = join(dir, 'cert.pem')
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
    ], { stdio: 'ignore' })
    tls = { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') }
  })

  afterEach(async () => {
    await cleanup?.()
    cleanup = undefined
  })

  it('shares an https (http2) dev server for the WebSocket upgrade', async () => {
    const host = '127.0.0.1'
    const { server, httpServer, close } = fakeHttpsViteServer(tls)
    await new Promise<void>(resolve => httpServer.listen(0, host, resolve))
    const { port } = httpServer.address() as { port: number }

    const plugin = viteDevframeHub({
      ui: false,
      auth: false,
      quiet: true,
      cwd: mkdtempSync(join(tmpdir(), 'devframe-vite-hub-')),
    })
    let ws: WebSocket | undefined
    cleanup = async () => {
      ws?.terminate()
      await (plugin.closeBundle as () => Promise<void>)()
      await close()
    }
    await (plugin.configureServer as (s: ViteDevServer) => Promise<void>)(server as any)

    const res = await getInsecure(`https://${host}:${port}/__devframes/__connection.json`)
    expect(res.status).toBe(200)
    expect((JSON.parse(res.body) as { websocket?: unknown }).websocket).toEqual({ path: '/__devframes/__ws' })

    ws = await openWs(`wss://${host}:${port}/__devframes/__ws`)
    expect(ws.readyState).toBe(WebSocket.OPEN)
  })
})
