import type { AddressInfo } from 'node:net'
import type { MockInstance } from 'vitest'
import type { RemoteAssets, RemoteAssetsErrorMessage, RemoteAssetsProviderCustom, RemoteAssetsStore } from '../types/remote-assets'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { H3, toNodeHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE } from '../constants'
import { resolveStaticAssetsSource } from './remote-assets'
import { serveStaticHandler } from './serve-static'

// `realpathSync` because module resolution reports realpaths, while the system
// temp dir is a symlink on macOS (`/var` → `/private/var`), so a path built from
// the raw `mkdtempSync` result would never match a resolved one.
function makeTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'devframe-remote-assets-')))
}

/** A fake CDN over a flat `filePath -> contents` map, answering the jsDelivr listing API + per-file URLs. */
function fakeCdn(files: Record<string, string>): { fetch: typeof globalThis.fetch, calls: string[] } {
  const calls: string[] = []
  interface Node { type: 'file' | 'directory', name: string, files?: Node[] }
  const tree = (): Node[] => {
    const root: Node[] = []
    for (const path of Object.keys(files)) {
      let level = root
      const segs = path.split('/')
      segs.forEach((seg, i) => {
        if (i === segs.length - 1) {
          level.push({ type: 'file', name: seg })
          return
        }
        let dir = level.find(n => n.type === 'directory' && n.name === seg)
        if (!dir)
          level.push(dir = { type: 'directory', name: seg, files: [] })
        level = dir.files!
      })
    }
    return root
  }
  const fetchImpl: typeof globalThis.fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://data.jsdelivr.com/'))
      return Response.json({ files: tree() })
    const prefix = 'https://cdn.jsdelivr.net/npm/@scope/demo-client@1.2.3/'
    const filePath = url.startsWith(prefix) ? url.slice(prefix.length) : undefined
    if (filePath && filePath in files)
      return new Response(files[filePath])
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
  return { package: '@scope/demo-client', version: '1.2.3', fetch: cdn.fetch, ...overrides }
}

/** Resolve `assets` into a store (fails if it resolved to a local dir instead). */
function storeFor(cdn: { fetch: typeof globalThis.fetch }, storageDir: string, overrides?: Partial<RemoteAssets>): RemoteAssetsStore {
  const resolved = resolveStaticAssetsSource(makeAssets(cdn, overrides), storageDir)
  if (typeof resolved === 'string')
    throw new TypeError('expected a store')
  return resolved
}

function cachePath(storageDir: string, file: string): string {
  return join(storageDir, '.remote-assets', '@scope+demo-client@1.2.3', file)
}

let warnSpy: MockInstance

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveStaticAssetsSource (remote store)', () => {
  it('serves through the provider and caches; a second serve skips the network', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const storageDir = makeTmp()
    const store = storeFor(cdn, storageDir)

    const res = await store.serve('/assets/app.js')
    expect(res!.headers.get('content-type')).toBe('text/javascript')
    await expect(res!.text()).resolves.toBe('console.log("app")')

    await vi.waitFor(() => expect(existsSync(cachePath(storageDir, 'dist/assets/app.js'))).toBe(true))

    const before = cdn.calls.filter(u => u.includes('app.js')).length
    await expect((await store.serve('/assets/app.js'))!.text()).resolves.toBe('console.log("app")')
    expect(cdn.calls.filter(u => u.includes('app.js')).length).toBe(before)
  })

  it('proxies the provider response: own content headers, no transfer-level ones', async () => {
    const upstream = (): Response => new Response('console.log("app")', {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-encoding': 'gzip',
        'content-length': '11',
        'etag': 'W/"abc"',
        'set-cookie': 'session=1',
        'x-frame-options': 'DENY',
        'cache-control': 'public, max-age=31536000',
      },
    })
    const store = storeFor({ fetch: async () => upstream() }, makeTmp())

    const res = (await store.serve('/assets/app.js'))!
    // `fetch` hands over a decoded body, so the encoded length would be a lie.
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('content-length')).toBeNull()
    // The provider's policy headers stay with the provider.
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-frame-options')).toBeNull()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/javascript')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('etag')).toBe('W/"abc"')
    await expect(res.text()).resolves.toBe('console.log("app")')
  })

  it('keeps the upstream content-length when the body arrived unencoded', async () => {
    const store = storeFor(
      { fetch: async () => new Response('hello', { headers: { 'content-length': '5' } }) },
      makeTmp(),
    )
    expect((await store.serve('/assets/app.js'))!.headers.get('content-length')).toBe('5')
  })

  it('resolves the manifest: index fallback, SPA fallback, and extension-ed 404', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const store = storeFor(cdn, makeTmp())

    await expect((await store.serve('/'))!.text()).resolves.toBe('<html>remote index</html>')
    await expect((await store.serve('/some/client/route'))!.text()).resolves.toBe('<html>remote index</html>')

    const before = cdn.calls.length
    await expect(store.serve('/missing.js')).resolves.toBeNull()
    expect(cdn.calls.length).toBe(before)
  })

  it('rejects traversal escapes', async () => {
    const store = storeFor(fakeCdn(CDN_FILES), makeTmp())
    await expect(store.serve('/../package.json')).resolves.toBeNull()
  })

  it('degrades to probe mode when the file listing fails (DF0059)', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const fetchImpl: typeof globalThis.fetch = async input =>
      String(input).startsWith('https://data.jsdelivr.com/') ? new Response('nope', { status: 500 }) : cdn.fetch(input)
    const store = storeFor(cdn, makeTmp(), { fetch: fetchImpl })
    await expect((await store.serve('/assets/app.js'))!.text()).resolves.toBe('console.log("app")')
    expect(warnSpy.mock.calls.some(a => String(a[0]).includes('DF0059'))).toBe(true)
  })

  it('offline: serves from the cache only and throws on a miss', async () => {
    const cdn = fakeCdn(CDN_FILES)
    const storageDir = makeTmp()
    await storeFor(cdn, storageDir).serve('/assets/app.js').then(r => r!.text())
    await vi.waitFor(() => expect(existsSync(cachePath(storageDir, 'dist/assets/app.js'))).toBe(true))

    const offline = storeFor(cdn, storageDir, { offline: true })
    await expect((await offline.serve('/assets/app.js'))!.text()).resolves.toBe('console.log("app")')
    await expect(offline.serve('/')).rejects.toThrow(/offline: true/)
  })

  it('materializes every file under `path` into a target directory', async () => {
    const store = storeFor(fakeCdn(CDN_FILES), makeTmp())
    const target = makeTmp()
    await store.materialize(target)
    expect(readFileSync(join(target, 'index.html'), 'utf8')).toBe('<html>remote index</html>')
    expect(readFileSync(join(target, 'assets/app.js'), 'utf8')).toBe('console.log("app")')
    expect(existsSync(join(target, 'package.json'))).toBe(false)
  })

  it('rejects unsafe provider-listed paths before fetching or writing them', async () => {
    const calls: string[] = []
    const fetchImpl: typeof globalThis.fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      return url.endsWith('/dist/assets/app.js') ? new Response('console.log("app")') : new Response('should never be served')
    }
    const provider: RemoteAssetsProviderCustom = {
      fileUrl: (pkg, version, filePath) => `https://mirror.example.com/${pkg}@${version}/${filePath}`,
      /**
       * A compromised (or merely buggy) custom provider; every entry below is
       * unsafe or out of scope except the one normal nested asset.
       */
      listFiles: async () => [
        'package.json', // ordinary file outside the selected prefix, stays ignored
        'dist/assets/app.js', // a normal nested asset, still materializes
        'dist/../evil-traversal.txt', // prefixed traversal entry
        '/outside/evil-absolute.txt', // absolute path entry
        'dist/evil\\..\\..\\evil-backslash.txt', // backslash traversal entry, rejected on every platform
        'dist-confusable/evil-prefix.txt', // prefix-confusion entry, outside the selected prefix
      ],
    }
    const store = storeFor({ fetch: fetchImpl }, makeTmp(), { provider })
    const target = makeTmp()

    await store.materialize(target)

    // The one normal nested asset still materializes.
    expect(readFileSync(join(target, 'assets/app.js'), 'utf8')).toBe('console.log("app")')
    // Nothing else was fetched...
    expect(calls).toEqual([expect.stringContaining('/dist/assets/app.js')])
    // ...or written, inside or outside the target directory.
    expect(existsSync(join(target, 'package.json'))).toBe(false)
    expect(existsSync(join(target, 'evil-traversal.txt'))).toBe(false)
    expect(existsSync(join(dirname(target), 'evil-traversal.txt'))).toBe(false)
    expect(existsSync(join(target, 'evil-backslash.txt'))).toBe(false)
    expect(existsSync(join(dirname(target), 'evil-prefix.txt'))).toBe(false)
  })

  it('supports the unpkg provider URL scheme', async () => {
    const calls: string[] = []
    const fetchImpl: typeof globalThis.fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url === 'https://unpkg.com/@scope/demo-client@1.2.3/?meta')
        return Response.json({ path: '/', type: 'directory', files: [{ path: '/dist/index.html', type: 'file' }] })
      if (url === 'https://unpkg.com/@scope/demo-client@1.2.3/dist/index.html')
        return new Response('<html>unpkg</html>')
      return new Response('not found', { status: 404 })
    }
    const store = storeFor({ fetch: fetchImpl }, makeTmp(), { provider: 'unpkg' })
    await expect((await store.serve('/'))!.text()).resolves.toBe('<html>unpkg</html>')
    expect(calls[0]).toBe('https://unpkg.com/@scope/demo-client@1.2.3/?meta')
  })
})

describe('resolveStaticAssetsSource (installed package)', () => {
  function install(version: string): { resolveFrom: string, distDir: string } {
    const root = makeTmp()
    const pkgDir = join(root, 'node_modules', '@scope', 'demo-client')
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@scope/demo-client', version }))
    writeFileSync(join(pkgDir, 'dist', 'index.html'), '<html>installed</html>')
    const entry = join(root, 'entry.mjs')
    writeFileSync(entry, '')
    return { resolveFrom: pathToFileURL(entry).href, distDir: join(pkgDir, 'dist') }
  }

  it('passes local directories through', () => {
    expect(resolveStaticAssetsSource('/some/dir', makeTmp())).toBe('/some/dir')
  })

  // `resolveStaticAssetsSource` returns `pathe` (forward-slash) paths; the
  // test builds `distDir` with `node:path` (backslash on Windows).
  const norm = (p: string): string => p.replace(/\\/g, '/')

  it('short-circuits to an exactly matching installed package', () => {
    const { resolveFrom, distDir } = install('1.2.3')
    expect(norm(resolveStaticAssetsSource({ package: '@scope/demo-client', version: '1.2.3', resolveFrom }, makeTmp()) as string)).toBe(norm(distDir))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns on minor/patch skew and serves the installed copy (DF0062)', () => {
    const { resolveFrom, distDir } = install('1.3.0')
    expect(norm(resolveStaticAssetsSource({ package: '@scope/demo-client', version: '1.2.3', resolveFrom }, makeTmp()) as string)).toBe(norm(distDir))
    expect(warnSpy.mock.calls.some(a => String(a[0]).includes('DF0062'))).toBe(true)
  })

  it('throws on a major version mismatch (DF0061)', () => {
    const { resolveFrom } = install('2.0.0')
    expect(() => resolveStaticAssetsSource({ package: '@scope/demo-client', version: '1.2.3', resolveFrom }, makeTmp()))
      .toThrow(/different major version/)
  })

  it('falls back to a store when the package is absent', () => {
    const { resolveFrom } = install('1.2.3')
    expect(typeof resolveStaticAssetsSource({ package: '@scope/other', version: '1.2.3', resolveFrom }, makeTmp())).not.toBe('string')
  })

  it('defaults resolveFrom from the third argument when the source omits it', () => {
    const { resolveFrom, distDir } = install('1.2.3')
    // No per-source `resolveFrom`; the definition-level default resolves it.
    expect(norm(resolveStaticAssetsSource({ package: '@scope/demo-client', version: '1.2.3' }, makeTmp(), resolveFrom) as string)).toBe(norm(distDir))
  })

  it('lets an explicit per-source resolveFrom win over the default', () => {
    const { resolveFrom, distDir } = install('1.2.3')
    // Default points nowhere useful; the explicit source value is used.
    expect(norm(resolveStaticAssetsSource({ package: '@scope/demo-client', version: '1.2.3', resolveFrom }, makeTmp(), 'file:///nowhere/entry.mjs') as string)).toBe(norm(distDir))
  })

  it('honors an explicit resolveFrom: null (opts out of the installed lookup) despite a default', () => {
    const { resolveFrom } = install('1.2.3')
    // `null` skips the installed-copy step entirely, falling back to a store.
    expect(typeof resolveStaticAssetsSource({ package: '@scope/demo-client', version: '1.2.3', resolveFrom: null }, makeTmp(), resolveFrom)).not.toBe('string')
  })
})

describe('resolveStaticAssetsSource (validation)', () => {
  it.each([
    ['UPPERCASE/name', '1.2.3'],
    ['has spaces', '1.2.3'],
    ['../escape', '1.2.3'],
    ['@scope/', '1.2.3'],
  ])('rejects invalid package %j (DF0065)', (pkg, version) => {
    expect(() => resolveStaticAssetsSource({ package: pkg, version }, makeTmp())).toThrow(/Invalid remote-assets package/)
  })

  it.each([
    ['@scope/ok', '../etc'],
    ['@scope/ok', 'latest'],
    ['@scope/ok', '1.2'],
    ['@scope/ok', '1.2.3/x'],
  ])('rejects invalid version for %j (DF0065)', (pkg, version) => {
    expect(() => resolveStaticAssetsSource({ package: pkg, version }, makeTmp())).toThrow(/Invalid remote-assets version/)
  })

  it('accepts valid scoped names and semver (incl. prerelease/build)', () => {
    const tmp = makeTmp()
    for (const version of ['1.2.3', '0.9.0-beta.4', '1.0.0+build.5', '10.20.30-rc.1+meta']) {
      expect(() => resolveStaticAssetsSource({ package: '@devframes/plugin-git-client', version, fetch: async () => new Response(null) }, tmp)).not.toThrow()
    }
  })
})

describe('serveStaticHandler with a remote store', () => {
  async function serve(store: RemoteAssetsStore): Promise<{ url: string, close: () => Promise<void> }> {
    const app = new H3()
    app.use(serveStaticHandler(store))
    const server = createServer(toNodeHandler(app))
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    return {
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      close: () => new Promise<void>(r => server.close(() => r())),
    }
  }

  it('serves through h3 and 404s a miss', async () => {
    const { url, close } = await serve(storeFor(fakeCdn(CDN_FILES), makeTmp()))
    try {
      const index = await fetch(`${url}/`)
      expect(index.status).toBe(200)
      expect(index.headers.get('content-type')).toContain('text/html')
      await expect(index.text()).resolves.toBe('<html>remote index</html>')
      expect((await fetch(`${url}/missing.js`)).status).toBe(404)
    }
    finally {
      await close()
    }
  })

  it('renders the styled error page for HTML navigations when the provider is down', async () => {
    const failing: typeof globalThis.fetch = async () => {
      throw new Error('network down')
    }
    const store = storeFor({ fetch: failing }, makeTmp())
    const { url, close } = await serve(store)
    try {
      const res = await fetch(`${url}/`, { headers: { accept: 'text/html' } })
      expect(res.status).toBe(502)
      const body = await res.text()
      expect(body).toContain('Client assets unavailable')
      expect(body).toContain('@scope/demo-client')
      // The page reports itself to an embedding viewer, which renders the
      // same failure in its own UI (`@devframes/hub-ui`'s iframe view).
      expect(body).toContain('window.parent.postMessage(')
      expect(body).toContain(DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE)
      const payload = JSON.parse(/postMessage\((\{.*?\}), '\*'\)/.exec(body)![1]) as RemoteAssetsErrorMessage
      expect(payload).toMatchObject({ package: '@scope/demo-client', version: '1.2.3' })
      expect(payload.reason).toContain('network down')

      const asset = await fetch(`${url}/app.js`, { headers: { accept: '*/*' } })
      expect(asset.status).toBe(502)
      await expect(asset.text()).resolves.toBe('')
    }
    finally {
      await close()
    }
  })
})
