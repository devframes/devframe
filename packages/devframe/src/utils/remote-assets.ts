import type {
  RemoteAssets,
  RemoteAssetsProviderCustom,
  RemoteAssetsStore,
  StaticAssetsSource,
} from '../types/remote-assets'
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { lookup } from 'mrmime'
import { createDebug } from 'obug'
import { dirname, extname, join, normalize, sep } from 'pathe'
import { diagnostics } from '../node/diagnostics'

const debugFetch = createDebug('devframe:remote-assets:fetch')
const debugCache = createDebug('devframe:remote-assets:cache')

const MANIFEST_FILENAME = '.manifest.json'

/**
 * Upstream response headers replayed to the browser. Everything outside this
 * list is dropped, because it describes the *provider's* transfer rather than
 * the file: hop-by-hop and encoding headers no longer match the body `fetch`
 * already decoded, and a CDN's policy headers (`set-cookie`, `cache-control`,
 * framing/CSP) belong to its origin — replaying them under the dev server's
 * origin could just as well break the iframe these assets render in.
 */
const PROXIED_HEADERS = ['content-language', 'etag', 'last-modified'] as const

const CACHE_CONTROL_HEADER = 'no-store'

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

interface TreeNode { type: 'file' | 'directory', name?: string, path?: string, files?: TreeNode[] }

/** Flatten a jsDelivr (`name`/`files`) or unpkg (`path`/`files`) file tree. */
function flattenTree(nodes: TreeNode[], style: 'name' | 'path'): string[] {
  const out: string[] = []
  const walk = (list: TreeNode[], prefix: string): void => {
    for (const node of list) {
      if (style === 'path') {
        if (node.type === 'file')
          out.push((node.path ?? '').replace(/^\//, ''))
        else
          walk(node.files ?? [], '')
      }
      else if (node.type === 'file') {
        out.push(prefix + (node.name ?? ''))
      }
      else if (node.files) {
        walk(node.files, `${prefix}${node.name}/`)
      }
    }
  }
  walk(nodes, '')
  return out
}

const providers: Record<'jsdelivr' | 'unpkg', Required<RemoteAssetsProviderCustom>> = {
  jsdelivr: {
    fileUrl: (pkg, version, filePath) => `https://cdn.jsdelivr.net/npm/${pkg}@${version}/${filePath}`,
    listFiles: async (pkg, version, fetchImpl) => {
      const url = `https://data.jsdelivr.com/v1/packages/npm/${pkg}@${version}`
      debugFetch('listing files for %s@%s from %s', pkg, version, url)
      const res = await fetchImpl(url)
      if (!res.ok)
        throw new Error(`HTTP ${res.status} from ${url}`)
      return flattenTree((await res.json() as { files?: TreeNode[] }).files ?? [], 'name')
    },
  },
  unpkg: {
    fileUrl: (pkg, version, filePath) => `https://unpkg.com/${pkg}@${version}/${filePath}`,
    listFiles: async (pkg, version, fetchImpl) => {
      const url = `https://unpkg.com/${pkg}@${version}/?meta`
      debugFetch('listing files for %s@%s from %s', pkg, version, url)
      const res = await fetchImpl(url)
      if (!res.ok)
        throw new Error(`HTTP ${res.status} from ${url}`)
      return flattenTree([await res.json() as TreeNode], 'path')
    },
  },
}

function resolveProvider(assets: RemoteAssets): { provider: RemoteAssetsProviderCustom, name: string } {
  const p = assets.provider ?? 'jsdelivr'
  return typeof p === 'string' ? { provider: providers[p], name: p } : { provider: p, name: 'custom' }
}

// ---------------------------------------------------------------------------
// Locally installed package resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a locally installed copy of `assets.package` from
 * `assets.resolveFrom`'s dependency graph and return its assets directory,
 * or `undefined` when the package (or directory) is absent. A different
 * installed version warns (`DF0062`); a different major throws (`DF0061`).
 */
function resolveInstalled(assets: RemoteAssets): string | undefined {
  if (assets.resolveFrom == null)
    return undefined
  let pkgJsonPath: string
  let installed: unknown
  try {
    const requireFrom = createRequire(assets.resolveFrom)
    pkgJsonPath = requireFrom.resolve(`${assets.package}/package.json`)
    installed = (requireFrom(`${assets.package}/package.json`) as { version?: unknown }).version
  }
  catch {
    return undefined
  }
  if (typeof installed !== 'string')
    return undefined
  if (installed !== assets.version) {
    const major = (v: string): string => v.trim().split('.')[0] ?? v
    if (major(installed) !== major(assets.version))
      throw diagnostics.DF0061({ package: assets.package, required: assets.version, installed })
    diagnostics.DF0062({ package: assets.package, required: assets.version, installed })
  }
  const dir = join(dirname(pkgJsonPath), assets.path ?? 'dist')
  return existsSync(dir) ? dir : undefined
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function contentTypeFor(filePath: string): string {
  const type = lookup(filePath)
  if (!type)
    return 'application/octet-stream'
  return type === 'text/html' ? 'text/html; charset=utf-8' : type
}

/**
 * Headers for a file streamed through from the provider. `Content-Type` and
 * `Cache-Control` are ours, so a file looks identical whether it came from the
 * provider or from the cache ({@link createStore}'s `serveCached`).
 */
function proxyHeaders(filePath: string, upstream: Headers): Headers {
  const headers = new Headers({
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': CACHE_CONTROL_HEADER,
  })
  // `fetch` decodes the body, so an encoded response's `Content-Length`
  // counts bytes the browser will never see — it only survives verbatim.
  const encoding = upstream.get('content-encoding')
  const length = upstream.get('content-length')
  if (length && (!encoding || encoding === 'identity'))
    headers.set('Content-Length', length)
  for (const name of PROXIED_HEADERS) {
    const value = upstream.get(name)
    if (value != null)
      headers.set(name, value)
  }
  return headers
}

/** Clean a request path into a safe package-relative POSIX path, or `null` if it escapes root. */
function cleanRequestPath(urlPath: string): string | null {
  let cleaned: string
  try {
    cleaned = decodeURIComponent(urlPath || '/')
  }
  catch {
    return null
  }
  cleaned = cleaned.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '')
  const normalized = normalize(cleaned)
  if (normalized === '..' || normalized.startsWith(`..${sep}`) || normalized.startsWith('/'))
    return null
  return normalized === '.' ? '' : normalized
}

/** Candidate files for a request, in order: direct hit, index, `.html`, SPA fallback. */
function candidatePaths(prefix: string, cleaned: string): string[] {
  const candidates: string[] = []
  if (cleaned)
    candidates.push(prefix + cleaned)
  candidates.push(`${prefix}${cleaned ? `${cleaned}/` : ''}index.html`)
  if (cleaned && !extname(cleaned))
    candidates.push(`${prefix + cleaned}.html`)
  if (!/\.[a-z0-9]+$/i.test(cleaned) && !candidates.includes(`${prefix}index.html`))
    candidates.push(`${prefix}index.html`)
  return candidates
}

function createStore(assets: RemoteAssets, cacheDir: string): RemoteAssetsStore {
  const normalized = { ...assets, path: assets.path ?? 'dist' }
  const { provider, name: providerName } = resolveProvider(assets)
  const fetchImpl = assets.fetch ?? globalThis.fetch
  const prefix = `${normalized.path}/`
  let manifestPromise: Promise<Set<string> | null> | undefined
  let manifestReported = false

  async function loadManifest(): Promise<Set<string> | null> {
    const manifestFile = join(cacheDir, MANIFEST_FILENAME)
    if (existsSync(manifestFile)) {
      try {
        return new Set(JSON.parse(await readFile(manifestFile, 'utf8')) as string[])
      }
      catch {}
    }
    if (assets.offline || !provider.listFiles)
      return null
    try {
      // A listing failure is not fatal — requests degrade to probing the
      // provider per candidate. Only a file that can't be fetched at all
      // surfaces to the user (`DF0060`, and the fallback page that carries
      // it into the viewer — see `remoteErrorPage` in `serve-static`).
      const files = await provider.listFiles(normalized.package, normalized.version, fetchImpl)
      await mkdir(cacheDir, { recursive: true })
      await writeFile(manifestFile, JSON.stringify(files), 'utf8').catch(() => {})
      return new Set(files)
    }
    catch (error) {
      if (!manifestReported) {
        manifestReported = true
        diagnostics.DF0059({ package: normalized.package, version: normalized.version, provider: providerName, reason: errText(error), cause: error })
      }
      return null
    }
  }

  async function serveCached(filePath: string): Promise<Response | null> {
    const abs = join(cacheDir, filePath)
    let size: number
    try {
      const s = await stat(abs)
      if (!s.isFile())
        return null
      size = s.size
    }
    catch {
      return null
    }
    debugCache('serving %s from cache (%d bytes)', filePath, size)
    return new Response(Readable.toWeb(createReadStream(abs)) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': contentTypeFor(filePath),
        'Content-Length': String(size),
        'Cache-Control': CACHE_CONTROL_HEADER,
      },
    })
  }

  /** Persist `body` to the cache at `filePath` (tmp + rename); failures warn (`DF0063`). */
  async function persist(filePath: string, body: ReadableStream<Uint8Array>): Promise<void> {
    const target = join(cacheDir, filePath)
    const tmp = `${target}.${Math.random().toString(36).slice(2)}.tmp`
    try {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(tmp, Buffer.from(await new Response(body).arrayBuffer()))
      await rename(tmp, target)
    }
    catch (error) {
      await rm(tmp, { force: true }).catch(() => {})
      diagnostics.DF0063({ filepath: target, reason: errText(error), cause: error })
    }
  }

  /** Fetch `filePath` through the provider: `null` on 404, a `Response` on 200, throws (`DF0060`) otherwise. */
  async function serveRemote(filePath: string): Promise<Response | null> {
    const url = provider.fileUrl(normalized.package, normalized.version, filePath)
    let res: Response
    try {
      debugFetch('fetching %s from %s', filePath, url)
      res = await fetchImpl(url)
    }
    catch (error) {
      throw diagnostics.DF0060({ url, package: normalized.package, reason: errText(error), cause: error })
    }
    if (res.status === 404) {
      await res.body?.cancel().catch(() => {})
      return null
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => {})
      throw diagnostics.DF0060({ url, package: normalized.package, reason: `HTTP ${res.status}` })
    }
    // The body is consumed twice — once by the client, once by the cache
    // writer — so the client gets a fresh `Response` over its own branch of
    // the tee; `res` itself is unusable from here on (the tee locked its body).
    const [toClient, toCache] = res.body.tee()
    void persist(filePath, toCache)
    return new Response(toClient, {
      status: res.status,
      statusText: res.statusText,
      headers: proxyHeaders(filePath, res.headers),
    })
  }

  async function serve(urlPath: string): Promise<Response | null> {
    const cleaned = cleanRequestPath(urlPath)
    if (cleaned === null)
      return null
    const candidates = candidatePaths(prefix, cleaned)
    manifestPromise ??= loadManifest()
    const manifest = await manifestPromise

    if (manifest) {
      const filePath = candidates.find(c => manifest.has(c))
      if (!filePath)
        return null
      return (await serveCached(filePath)) ?? (assets.offline
        ? Promise.reject(diagnostics.DF0060({ url: filePath, package: normalized.package, reason: 'offline: true and the file is not in the cache' }))
        : serveRemote(filePath))
    }

    // Probe mode (no listing): cache first, then the provider per candidate.
    for (const candidate of candidates) {
      const cached = await serveCached(candidate)
      if (cached)
        return cached
    }
    if (assets.offline)
      return null
    for (const candidate of candidates) {
      const remote = await serveRemote(candidate)
      if (remote)
        return remote
    }
    return null
  }

  async function materialize(targetDir: string): Promise<void> {
    const fail = (reason: string, cause?: unknown): never => {
      throw diagnostics.DF0064({ package: normalized.package, version: normalized.version, reason, cause })
    }
    if (!provider.listFiles)
      fail('the configured provider has no file listing (`listFiles`)')
    let files: string[]
    try {
      files = await provider.listFiles!(normalized.package, normalized.version, fetchImpl)
    }
    catch (error) {
      return fail(errText(error), error)
    }
    for (const filePath of files.filter(f => f.startsWith(prefix))) {
      const target = join(targetDir, filePath.slice(prefix.length))
      const url = provider.fileUrl(normalized.package, normalized.version, filePath)
      let res: Response
      try {
        res = await fetchImpl(url)
        if (!res.ok)
          throw new Error(`HTTP ${res.status}`)
      }
      catch (error) {
        return fail(`failed to download ${filePath}: ${errText(error)}`, error)
      }
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, Buffer.from(await res.arrayBuffer()))
    }
  }

  return { assets: normalized, serve, materialize }
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// npm package name rules (github.com/npm/validate-npm-package-name), and an
// exact semver version — both interpolated into CDN URLs and the cache path,
// so they must not carry separators, `@`, or traversal segments.
const PACKAGE_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[a-z0-9-]+(?:\.[a-z0-9-]+)*)?(?:\+[a-z0-9-]+(?:\.[a-z0-9-]+)*)?$/i

/** Reject a {@link RemoteAssets} with an unsafe package name or version (`DF0065`). */
function assertValidRemoteAssets(assets: RemoteAssets): void {
  if (assets.package.length > 214 || !PACKAGE_NAME_RE.test(assets.package))
    throw diagnostics.DF0065({ field: 'package', value: assets.package })
  if (!VERSION_RE.test(assets.version))
    throw diagnostics.DF0065({ field: 'version', value: assets.version })
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

/**
 * Normalize a {@link StaticAssetsSource} into something servable: a local
 * directory (strings pass through; a remote source short-circuits to a
 * locally installed copy of its package when present) or a caching
 * {@link RemoteAssetsStore} back-proxy. Remote caches live under
 * `<projectStorageDir>/.remote-assets/<package>@<version>/`.
 *
 * A remote source's `package`/`version` are validated first (`DF0065`) — both
 * are interpolated into CDN URLs and the cache path.
 *
 * `defaultResolveFrom` (typically the declaring devframe's `importMetaUrl`)
 * supplies a `resolveFrom` base for a remote source that doesn't set one:
 * it is applied only when `source.resolveFrom` is `undefined`, so an explicit
 * per-source string still wins and an explicit `null` still opts out of the
 * installed-copy lookup.
 */
export function resolveStaticAssetsSource(
  source: StaticAssetsSource,
  projectStorageDir: string,
  defaultResolveFrom?: string | null,
): string | RemoteAssetsStore {
  if (typeof source === 'string')
    return source
  assertValidRemoteAssets(source)
  const resolved: RemoteAssets = source.resolveFrom === undefined && defaultResolveFrom != null
    ? { ...source, resolveFrom: defaultResolveFrom }
    : source
  return resolveInstalled(resolved)
    ?? createStore(resolved, join(projectStorageDir, '.remote-assets', `${resolved.package.replace(/\//g, '+')}@${resolved.version}`))
}
