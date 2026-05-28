import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { extname, join, normalize, resolve, sep } from 'pathe'
import { ensureMinimalNextDevframeHub, getStaticMount } from '../../../devframe/minimal-next-devframe-hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

interface ResolvedFile {
  abs: string
  size: number
  mtime: Date
}

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

async function resolveTarget(absDir: string, urlPath: string): Promise<ResolvedFile | null> {
  let cleaned = decodeURIComponent(urlPath || '/').replace(/[?#].*$/, '')
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

  // Directory → index.html
  try {
    const s = await stat(abs)
    if (s.isDirectory()) {
      const candidate = await statFile(join(abs, 'index.html'))
      if (candidate)
        return candidate
    }
  }
  catch {
    // not found / not a directory — continue
  }

  // SPA fallback for extensionless paths
  if (!/\.[a-z0-9]+$/i.test(cleaned)) {
    const fallback = await statFile(join(absDir, 'index.html'))
    if (fallback)
      return fallback
  }

  return null
}

export async function GET(request: Request): Promise<Response> {
  await ensureMinimalNextDevframeHub()

  const pathname = new URL(request.url).pathname
  const hit = getStaticMount(pathname)
  if (!hit)
    return new Response(null, { status: 404 })

  const file = await resolveTarget(resolve(hit.distDir), hit.relative)
  if (!file)
    return new Response(null, { status: 404 })

  return new Response(Readable.toWeb(createReadStream(file.abs)) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPES[extname(file.abs).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': String(file.size),
      'Last-Modified': file.mtime.toUTCString(),
      'Cache-Control': 'no-store',
    },
  })
}
