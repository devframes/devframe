import type { EventHandler } from 'h3'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'
import type { RemoteAssetsStore } from '../types/remote-assets'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { defineHandler, H3 } from 'h3'
import { lookup } from 'mrmime'
import { extname, join, normalize, resolve, sep } from 'pathe'

/**
 * What the static-serving engine accepts: a local directory, or a resolved
 * {@link RemoteAssetsStore} back-proxy (from `devframe/utils/remote-assets`).
 */
export type ServableAssets = string | RemoteAssetsStore

export interface ServeStaticOptions {
  /** Default: `['index.html']`. */
  indexNames?: string[]
  /** SPA fallback to `indexNames[0]` on miss. Default: `true`. */
  single?: boolean
}

interface ResolvedFile {
  abs: string
  size: number
  mtime: Date
}

const HTML_EXTENSIONS = ['.html', '.htm']

async function statFile(abs: string): Promise<ResolvedFile | null> {
  try {
    const s = await stat(abs)
    if (!s.isFile())
      return null
    return { abs, size: s.size, mtime: s.mtime }
  }
  catch {
    return null
  }
}

async function resolveTarget(
  absDir: string,
  urlPath: string,
  indexNames: string[],
  single: boolean,
): Promise<ResolvedFile | null> {
  let cleaned: string
  try {
    cleaned = decodeURIComponent(urlPath || '/')
  }
  catch {
    return null
  }
  cleaned = cleaned.replace(/[?#].*$/, '')
  if (cleaned.endsWith('/'))
    cleaned = cleaned.slice(0, -1)
  if (cleaned.startsWith('/'))
    cleaned = cleaned.slice(1)

  const abs = normalize(join(absDir, cleaned))

  if (abs !== absDir && !abs.startsWith(absDir + sep))
    return null

  const direct = await statFile(abs)
  if (direct)
    return direct

  try {
    const s = await stat(abs)
    if (s.isDirectory()) {
      for (const name of indexNames) {
        const candidate = await statFile(join(abs, name))
        if (candidate)
          return candidate
      }
    }
  }
  catch {
    // not found / not a directory — continue
  }

  // Mirror sirv's `extensions: ['html', 'htm']` default: when the request
  // has no file extension, try `${path}.html` / `${path}.htm` before SPA
  // fallback so pretty-URL deployments resolve to the right page.
  if (!extname(cleaned)) {
    for (const ext of HTML_EXTENSIONS) {
      const candidate = await statFile(abs + ext)
      if (candidate)
        return candidate
    }
  }

  const fallbackIndex = indexNames[0]
  if (single && fallbackIndex && !/\.[a-z0-9]+$/i.test(cleaned)) {
    const indexFile = await statFile(join(absDir, fallbackIndex))
    if (indexFile)
      return indexFile
  }

  return null
}

function contentTypeFor(abs: string): string {
  const type = lookup(abs)
  if (!type)
    return 'application/octet-stream'
  if (type === 'text/html')
    return 'text/html; charset=utf-8'
  return type
}

function staticHeadersFor(file: ResolvedFile): Record<string, string> {
  return {
    'Content-Type': contentTypeFor(file.abs),
    'Content-Length': String(file.size),
    'Last-Modified': file.mtime.toUTCString(),
    'Cache-Control': 'no-store',
  }
}

function applyStaticHeadersToNode(res: ServerResponse, file: ResolvedFile): void {
  for (const [k, v] of Object.entries(staticHeadersFor(file)))
    res.setHeader(k, v)
}

interface NormalizedOptions {
  indexNames: string[]
  single: boolean
}

function normalizeOptions(options: ServeStaticOptions | undefined): NormalizedOptions {
  return {
    indexNames: options?.indexNames ?? ['index.html'],
    single: options?.single ?? true,
  }
}

/**
 * Drive one request through a {@link RemoteAssetsStore}: the store's
 * `Response` on a hit, a 404 on a miss, or a 502 (styled error page for HTML
 * navigations) on provider failure — shared between the h3 and connect flavors.
 */
async function remoteResponse(store: RemoteAssetsStore, urlPath: string, accept: string | null | undefined): Promise<Response> {
  try {
    return (await store.serve(urlPath)) ?? new Response(null, { status: 404 })
  }
  catch (error) {
    if (typeof accept === 'string' && accept.includes('text/html')) {
      return new Response(
        remoteErrorPage(store.assets.package, store.assets.version, error instanceof Error ? error.message : String(error)),
        { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      )
    }
    return new Response(null, { status: 502 })
  }
}

function serveRemoteAssetsHandler(store: RemoteAssetsStore): EventHandler {
  return defineHandler(async (event) => {
    const method = event.req.method
    if (method !== 'GET' && method !== 'HEAD') {
      event.res.status = 405
      event.res.headers.set('Allow', 'GET, HEAD')
      return ''
    }
    const res = await remoteResponse(store, event.url.pathname, event.req.headers.get('accept'))
    event.res.status = res.status
    res.headers.forEach((v, k) => event.res.headers.set(k, v))
    if (method === 'HEAD') {
      await res.body?.cancel().catch(() => {})
      return ''
    }
    return (res.body ?? '') as ReadableStream
  })
}

/**
 * h3 event handler that serves files from `source` with SPA fallback — a
 * local directory, or a {@link RemoteAssetsStore} whose files stream through
 * the CDN back-proxy into the local cache.
 *
 * Drop-in replacement for `fromNodeMiddleware(sirv(dir, { dev: true, single: true }))`
 * when the surrounding server is an h3 app — no `Cache-Control` beyond
 * `no-store`, `Content-Type` resolved via `mrmime`, and a miss with no
 * file extension falls back to `<dir>/index.html` so client-side routing
 * works.
 */
export function serveStaticHandler(
  source: ServableAssets,
  options?: ServeStaticOptions,
): EventHandler {
  if (typeof source !== 'string')
    return serveRemoteAssetsHandler(source)
  const absDir = resolve(source)
  const opts = normalizeOptions(options)
  return defineHandler(async (event) => {
    const method = event.req.method
    if (method !== 'GET' && method !== 'HEAD') {
      event.res.status = 405
      event.res.headers.set('Allow', 'GET, HEAD')
      return ''
    }
    const file = await resolveTarget(absDir, event.url.pathname, opts.indexNames, opts.single)
    if (!file) {
      event.res.status = 404
      return ''
    }
    for (const [k, v] of Object.entries(staticHeadersFor(file)))
      event.res.headers.set(k, v)
    if (method === 'HEAD')
      return ''
    return Readable.toWeb(createReadStream(file.abs)) as ReadableStream
  })
}

/**
 * Mount {@link serveStaticHandler} on an h3 app at `base`.
 *
 * h3's sub-app mount provides segment-boundary matching and strips `base`
 * from `event.url.pathname`, so the file resolver sees paths relative to
 * `dir`.
 */
export function mountStaticHandler(
  app: H3,
  base: string,
  source: ServableAssets,
  options?: ServeStaticOptions,
): void {
  const staticApp = new H3()
  staticApp.use(serveStaticHandler(source, options))
  app.mount(base.replace(/\/$/, ''), staticApp)
}

/**
 * Connect/Express-style Node middleware variant of {@link serveStaticHandler}.
 *
 * Use when mounting onto `viteServer.middlewares.use(base, …)` or any other
 * Connect stack — avoids forcing the host package to depend on h3 just to
 * adapt an event handler back into Node middleware.
 */
export function serveStaticNodeMiddleware(
  source: ServableAssets,
  options?: ServeStaticOptions,
): (req: IncomingMessage, res: ServerResponse, next?: (err?: Error) => void) => void {
  const absDir = typeof source === 'string' ? resolve(source) : undefined
  const opts = normalizeOptions(options)
  return (req, res, next) => {
    void (async () => {
      const method = req.method
      if (method !== 'GET' && method !== 'HEAD') {
        if (next) {
          next()
          return
        }
        res.statusCode = 405
        res.setHeader('Allow', 'GET, HEAD')
        res.end()
        return
      }
      const url = req.url ?? '/'

      if (absDir === undefined) {
        const response = await remoteResponse(source as RemoteAssetsStore, url, req.headers.accept)
        if (response.status === 404 && next) {
          next()
          return
        }
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        if (method === 'HEAD' || !response.body) {
          await response.body?.cancel().catch(() => {})
          res.end()
          return
        }
        Readable.fromWeb(response.body as NodeWebReadableStream<Uint8Array>).pipe(res)
        return
      }

      const file = await resolveTarget(absDir, url, opts.indexNames, opts.single)
      if (!file) {
        if (next) {
          next()
          return
        }
        res.statusCode = 404
        res.end()
        return
      }
      applyStaticHeadersToNode(res, file)
      if (method === 'HEAD') {
        res.end()
        return
      }
      createReadStream(file.abs).pipe(res)
    })().catch((err: unknown) => {
      if (next) {
        next(err instanceof Error ? err : new Error(String(err)))
        return
      }
      res.statusCode = 500
      res.end()
    })
  }
}

/**
 * Minimal, dependency-free HTML shown when a remote-assets request cannot
 * be satisfied (no installed package, no cache, provider unreachable).
 */
function remoteErrorPage(pkg: string, version: string, reason: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const name = esc(pkg)
  const ver = esc(version)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Client assets unavailable</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 14px/1.6 ui-sans-serif, system-ui, sans-serif; background: #fafafa; color: #27272a; }
  main { max-width: 32rem; padding: 2rem; }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 .5rem; }
  p { margin: .5rem 0; opacity: .8; }
  pre { font: 12px/1.6 ui-monospace, monospace; background: rgb(125 125 125 / .12); border-radius: 6px; padding: .75rem 1rem; overflow-x: auto; }
  button { font: inherit; padding: .35rem 1rem; border-radius: 6px; border: 1px solid rgb(125 125 125 / .3); background: transparent; color: inherit; cursor: pointer; }
  button:hover { background: rgb(125 125 125 / .08); }
  .muted { opacity: .55; font-size: 12px; }
  @media (prefers-color-scheme: dark) { body { background: #111; color: #d4d4d8; } }
</style>
</head>
<body>
<main>
  <h1>Client assets unavailable</h1>
  <p>The UI for this tool is served from <code>${name}@${ver}</code>, which could not be reached.</p>
  <pre>${esc(reason)}</pre>
  <p>To use it without network access, install the assets package locally:</p>
  <pre>npm install ${name}@${ver}</pre>
  <button onclick="location.reload()">Retry</button>
  <p class="muted">devframe remote assets</p>
</main>
</body>
</html>
`
}
