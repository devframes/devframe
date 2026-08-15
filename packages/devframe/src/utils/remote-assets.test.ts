import type { AddressInfo } from 'node:net'
import type { MockInstance } from 'vitest'
import type { RemoteAssets } from '../types/remote-assets'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { H3, toNodeHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRemoteAssetsStore,
  remoteAssetsCacheDir,
  remoteAssetsCacheRoot,
  renderRemoteAssetsErrorPage,
  resolveInstalledRemoteAssets,
  resolveStaticAssetsSource,
} from './remote-assets'
import { serveStaticHandler } from './serve-static'

function makeTmp(prefix = 'devframe-remote-assets-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/**
 * A fake CDN over a flat `filePath -> contents` map, answering both the
 * jsDelivr file-listing API and per-file URLs. Counts fetches per URL.
 */
function fakeCdn(files: Record<string, string>): { fetch: typeof globalThis.fetch, calls: string[] } {
  const calls: string[] = []
  interface TreeNode { type: 'file' | 'directory', name: string, files?: TreeNode[] }
  const buildTree = (): TreeNode[] => {
    const root: TreeNode[] = []
    for (const path of Object.keys(files)) {
      let level = root
      const segments = path.split('/')
      for (const [i, segment] of segments.entries()) {
        if (i === segments.length - 1) {
          level.push({ type: 'file', name: segment })
          break
        }
        let dir = level.find(node => node.type === 'directory' && node.name === segment)
        if (!dir) {
          dir = { type: 'directory', name: segment, files: [] }
          level.push(dir)
        }
        level = dir.files!
      }
    }
    return root
  }
  const fetchImpl: typeof globalThis.fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://data.jsdelivr.com/'))
      return Response.json({ files: buildTree() })
    const cdnPrefix = 'https://cdn.jsdelivr.net/npm/@scope/demo-client@1.2.3/'
    const filePath = url.startsWith(cdnPrefix) ? url.slice(cdnPrefix.length) : undefined
    if (filePath && filePath in files)
      return new Response(files[filePath], { headers: { 'Content-Type': 'application/octet-stream' } })
    return new Response('not found', { status: 404 })
  }
  return { fetch: fetchImpl, calls }
}

const CDN_FILES = {
  'package.json': '{}',
  'dist/index.html': '<html>remote index</html>',
  'dist/assets/app.js': 'console.log("app")',
}

function makeAssets(cdn: { fetch: typeof globalThis.fetch }, overrides?: Partial<RemoteAssets>): RemoteAssets {
  return {
    package: '@scope/demo-client',
    version: '1.2.3',
    fetch: cdn.fetch,
    ...overrides,
  }
}

let warnSpy: MockInstance
let errorSpy: MockInstance

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

async function text(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

describe('createRemoteAssetsStore', () => {
  it('serves files through the provider and caches them', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const cacheDir = join(makeTmp(), 'cache')
    const store = createRemoteAssetsStore(makeAssets(cdn), { cacheDir })

    const file = await store.serve('/assets/app.js')
    expect(file).not.toBeNull()
    expect(file!.headers['Content-Type']).toBe('text/javascript')
    await expect(text(file!.stream())).resolves.toBe('console.log("app")')

    // The teed cache write settles asynchronously.
    await vi.waitFor(() => {
      expect(existsSync(join(cacheDir, 'dist/assets/app.js'))).toBe(true)
    })
    expect(readFileSync(join(cacheDir, 'dist/assets/app.js'), 'utf8')).toBe('console.log("app")')

    // Second serve comes from the cache — no new file fetch.
    const fetchesBefore = cdn.calls.filter(url => url.includes('app.js')).length
    const again = await store.serve('/assets/app.js')
    await expect(text(again!.stream())).resolves.toBe('console.log("app")')
    expect(cdn.calls.filter(url => url.includes('app.js')).length).toBe(fetchesBefore)
  })

  it('resolves the manifest: index fallback, SPA fallback, and correct 404s', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const store = createRemoteAssetsStore(makeAssets(cdn), { cacheDir: join(makeTmp(), 'cache') })

    const index = await store.serve('/')
    await expect(text(index!.stream())).resolves.toBe('<html>remote index</html>')

    // SPA fallback: extensionless miss resolves to index.html.
    const spa = await store.serve('/some/client/route')
    await expect(text(spa!.stream())).resolves.toBe('<html>remote index</html>')

    // A miss with a file extension is a real 404 — no provider probe.
    const missCallsBefore = cdn.calls.length
    await expect(store.serve('/missing.js')).resolves.toBeNull()
    expect(cdn.calls.length).toBe(missCallsBefore)
  })

  it('rejects traversal escapes', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const store = createRemoteAssetsStore(makeAssets(cdn), { cacheDir: join(makeTmp(), 'cache') })
    await expect(store.serve('/../package.json')).resolves.toBeNull()
  })

  it('falls back to probe mode when the file listing fails (DF0058)', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const failingListing: typeof globalThis.fetch = async (input) => {
      const url = String(input)
      if (url.startsWith('https://data.jsdelivr.com/'))
        return new Response('nope', { status: 500 })
      return cdn.fetch(input)
    }
    const store = createRemoteAssetsStore(
      makeAssets(cdn, { fetch: failingListing }),
      { cacheDir: join(makeTmp(), 'cache') },
    )
    const file = await store.serve('/assets/app.js')
    await expect(text(file!.stream())).resolves.toBe('console.log("app")')
    expect(warnSpy.mock.calls.some(args => String(args[0]).includes('DF0058'))).toBe(true)
  })

  it('offline: serves from the cache only and throws on a miss (DF0059)', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const cacheDir = join(makeTmp(), 'cache')

    // Warm the cache (and the manifest) online first.
    const online = createRemoteAssetsStore(makeAssets(cdn), { cacheDir })
    const warmed = await online.serve('/assets/app.js')
    await text(warmed!.stream())
    await vi.waitFor(() => {
      expect(existsSync(join(cacheDir, 'dist/assets/app.js'))).toBe(true)
    })

    const offline = createRemoteAssetsStore(makeAssets(cdn, { offline: true }), { cacheDir })
    const cached = await offline.serve('/assets/app.js')
    await expect(text(cached!.stream())).resolves.toBe('console.log("app")')
    await expect(offline.serve('/')).rejects.toThrow(/offline: true/)
  })

  it('materializes every file under `path` into a target directory', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const store = createRemoteAssetsStore(makeAssets(cdn), { cacheDir: join(makeTmp(), 'cache') })
    const target = join(makeTmp(), 'out')
    await store.materialize(target)
    expect(readFileSync(join(target, 'index.html'), 'utf8')).toBe('<html>remote index</html>')
    expect(readFileSync(join(target, 'assets/app.js'), 'utf8')).toBe('console.log("app")')
    // Files outside `path` stay out.
    expect(existsSync(join(target, 'package.json'))).toBe(false)
  })

  it('supports the unpkg provider URL scheme', async () => {
    const calls: string[] = []
    const fetchImpl: typeof globalThis.fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url === 'https://unpkg.com/@scope/demo-client@1.2.3/?meta') {
        return Response.json({
          path: '/',
          type: 'directory',
          files: [{ path: '/dist/index.html', type: 'file' }],
        })
      }
      if (url === 'https://unpkg.com/@scope/demo-client@1.2.3/dist/index.html')
        return new Response('<html>unpkg</html>')
      return new Response('not found', { status: 404 })
    }
    const store = createRemoteAssetsStore(
      { package: '@scope/demo-client', version: '1.2.3', provider: 'unpkg', fetch: fetchImpl },
      { cacheDir: join(makeTmp(), 'cache') },
    )
    const file = await store.serve('/')
    await expect(text(file!.stream())).resolves.toBe('<html>unpkg</html>')
    expect(calls[0]).toBe('https://unpkg.com/@scope/demo-client@1.2.3/?meta')
  })
})

describe('resolveInstalledRemoteAssets', () => {
  function makeInstalled(version: string): { resolveFrom: string, distDir: string } {
    const root = makeTmp()
    const pkgDir = join(root, 'node_modules', '@scope', 'demo-client')
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@scope/demo-client', version }))
    writeFileSync(join(pkgDir, 'dist', 'index.html'), '<html>installed</html>')
    const entry = join(root, 'entry.mjs')
    writeFileSync(entry, '')
    return { resolveFrom: pathToFileURL(entry).href, distDir: join(pkgDir, 'dist') }
  }

  it('resolves an exactly matching installed package', () => {
    const { resolveFrom, distDir } = makeInstalled('1.2.3')
    const dir = resolveInstalledRemoteAssets({ package: '@scope/demo-client', version: '1.2.3', resolveFrom })
    expect(dir).toBe(distDir)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns on minor/patch skew and serves the installed copy (DF0061)', () => {
    const { resolveFrom, distDir } = makeInstalled('1.3.0')
    const dir = resolveInstalledRemoteAssets({ package: '@scope/demo-client', version: '1.2.3', resolveFrom })
    expect(dir).toBe(distDir)
    expect(warnSpy.mock.calls.some(args => String(args[0]).includes('DF0061'))).toBe(true)
  })

  it('throws on a major version mismatch (DF0060)', () => {
    const { resolveFrom } = makeInstalled('2.0.0')
    expect(() => resolveInstalledRemoteAssets({ package: '@scope/demo-client', version: '1.2.3', resolveFrom }))
      .toThrow(/different major version/)
  })

  it('returns undefined when the package is absent or resolveFrom is unset', () => {
    const { resolveFrom } = makeInstalled('1.2.3')
    expect(resolveInstalledRemoteAssets({ package: '@scope/other', version: '1.2.3', resolveFrom })).toBeUndefined()
    expect(resolveInstalledRemoteAssets({ package: '@scope/demo-client', version: '1.2.3' })).toBeUndefined()
  })
})

describe('resolveStaticAssetsSource', () => {
  it('passes local directories through', () => {
    expect(resolveStaticAssetsSource('/some/dir', { cacheRoot: '/tmp/x' })).toBe('/some/dir')
  })

  it('short-circuits to an installed package, otherwise builds a store with a version-locked cache dir', () => {
    const cdn = fakeCdn(CDN_FILES)
    const cacheRoot = remoteAssetsCacheRoot(join(makeTmp(), 'node_modules/.demo/devframe'))
    const source = makeAssets(cdn)
    const resolved = resolveStaticAssetsSource(source, { cacheRoot })
    expect(typeof resolved).not.toBe('string')
    if (typeof resolved !== 'string') {
      expect(resolved.kind).toBe('remote-assets-store')
      expect(resolved.cacheDir).toBe(remoteAssetsCacheDir(cacheRoot, source))
      expect(resolved.cacheDir).toContain('@scope+demo-client@1.2.3')
    }
  })
})

describe('serveStaticHandler with a remote store', () => {
  it('serves through h3, streams remote files, and renders the error page on provider failure', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const store = createRemoteAssetsStore(makeAssets(cdn), { cacheDir: join(makeTmp(), 'cache') })
    const app = new H3()
    app.use(serveStaticHandler(store))
    const server = createServer(toNodeHandler(app))
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    try {
      const index = await fetch(`${baseUrl}/`)
      expect(index.status).toBe(200)
      expect(index.headers.get('content-type')).toContain('text/html')
      await expect(index.text()).resolves.toBe('<html>remote index</html>')

      const miss = await fetch(`${baseUrl}/missing.js`)
      expect(miss.status).toBe(404)
    }
    finally {
      await new Promise<void>(r => server.close(() => r()))
    }
  })

  it('responds with the styled error page for HTML navigations when the provider is down', async () => {
    const failing: typeof globalThis.fetch = async () => {
      throw new Error('network down')
    }
    const store = createRemoteAssetsStore(
      { package: '@scope/demo-client', version: '1.2.3', fetch: failing },
      { cacheDir: join(makeTmp(), 'cache') },
    )
    const app = new H3()
    app.use(serveStaticHandler(store))
    const server = createServer(toNodeHandler(app))
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    try {
      const res = await fetch(`${baseUrl}/`, { headers: { accept: 'text/html' } })
      expect(res.status).toBe(502)
      const body = await res.text()
      expect(body).toContain('Client assets unavailable')
      expect(body).toContain('@scope/demo-client')

      const asset = await fetch(`${baseUrl}/app.js`, { headers: { accept: '*/*' } })
      expect(asset.status).toBe(502)
      await expect(asset.text()).resolves.toBe('')
    }
    finally {
      await new Promise<void>(r => server.close(() => r()))
    }
  })
})

describe('renderRemoteAssetsErrorPage', () => {
  it('escapes interpolated values', () => {
    const html = renderRemoteAssetsErrorPage({ package: '<script>', version: '1.0.0', reason: 'a & b' })
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b')
    expect(html).not.toContain('<script>')
  })
})
