#!/usr/bin/env node
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import process from 'node:process'

const [, , dirArg, portArg] = process.argv
if (!dirArg || !portArg) {
  console.error('Usage: serve-static.mjs <dir> <port>')
  process.exit(1)
}

const root = resolve(process.cwd(), dirArg)
const port = Number(portArg)
const host = '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

function resolveAsset(urlPath) {
  // Strip query/hash.
  const clean = urlPath.split('?')[0].split('#')[0]
  const decoded = decodeURIComponent(clean)
  // Treat trailing-slash URLs as index.html.
  const requestPath = decoded.endsWith('/') ? `${decoded}index.html` : decoded
  const target = normalize(join(root, requestPath))
  const fromRoot = relative(root, target)
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot))
    return null
  try {
    const st = statSync(target)
    if (st.isFile())
      return target
  }
  catch {}
  return null
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers)
  res.end(body)
}

const server = createServer((req, res) => {
  const found = resolveAsset(req.url ?? '/')
  // SPA fallback — unknown routes (no file extension match) serve index.html
  // so client-side routing works under the static dump.
  const file = found ?? resolveAsset('/index.html')
  if (!file) {
    send(res, 404, 'Not Found')
    return
  }
  const type = MIME[extname(file)] ?? 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  createReadStream(file).pipe(res)
})

server.listen(port, host, () => {
  process.stdout.write(`[serve-static] http://${host}:${port}/ -> ${root}\n`)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0))
  })
}
