import type {
  RemoteAssets,
  RemoteAssetsProviderCustom,
  RemoteAssetsServedFile,
  RemoteAssetsServeOptions,
  RemoteAssetsStore,
  StaticAssetsSource,
} from '../types/remote-assets'
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { lookup } from 'mrmime'
import { dirname, extname, join, normalize, resolve, sep } from 'pathe'
import { diagnostics } from '../node/diagnostics'

const MANIFEST_FILENAME = '.manifest.json'
const HTML_EXTENSIONS = ['.html', '.htm']

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

interface JsdelivrTreeNode {
  type: 'file' | 'directory'
  name: string
  files?: JsdelivrTreeNode[]
}

interface UnpkgMetaNode {
  path: string
  type: 'file' | 'directory'
  files?: UnpkgMetaNode[]
}

const jsdelivrProvider: Required<RemoteAssetsProviderCustom> = {
  fileUrl: (pkg, version, filePath) =>
    `https://cdn.jsdelivr.net/npm/${pkg}@${version}/${filePath}`,
  listFiles: async (pkg, version, fetchImpl) => {
    const res = await fetchImpl(`https://data.jsdelivr.com/v1/packages/npm/${pkg}@${version}`)
    if (!res.ok)
      throw new Error(`HTTP ${res.status} from data.jsdelivr.com`)
    const data = await res.json() as { files?: JsdelivrTreeNode[] }
    const out: string[] = []
    const walk = (nodes: JsdelivrTreeNode[], prefix: string): void => {
      for (const node of nodes) {
        if (node.type === 'file')
          out.push(prefix + node.name)
        else if (node.files)
          walk(node.files, `${prefix}${node.name}/`)
      }
    }
    walk(data.files ?? [], '')
    return out
  },
}

const unpkgProvider: Required<RemoteAssetsProviderCustom> = {
  fileUrl: (pkg, version, filePath) =>
    `https://unpkg.com/${pkg}@${version}/${filePath}`,
  listFiles: async (pkg, version, fetchImpl) => {
    const res = await fetchImpl(`https://unpkg.com/${pkg}@${version}/?meta`)
    if (!res.ok)
      throw new Error(`HTTP ${res.status} from unpkg.com`)
    const root = await res.json() as UnpkgMetaNode
    const out: string[] = []
    const walk = (node: UnpkgMetaNode): void => {
      if (node.type === 'file')
        out.push(node.path.replace(/^\//, ''))
      else
        node.files?.forEach(walk)
    }
    walk(root)
    return out
  },
}

function resolveProvider(assets: RemoteAssets): RemoteAssetsProviderCustom {
  const provider = assets.provider ?? 'jsdelivr'
  if (provider === 'jsdelivr')
    return jsdelivrProvider
  if (provider === 'unpkg')
    return unpkgProvider
  return provider
}

function providerName(assets: RemoteAssets): string {
  const provider = assets.provider ?? 'jsdelivr'
  return typeof provider === 'string' ? provider : 'custom'
}

// ---------------------------------------------------------------------------
// Locally installed package resolution
// ---------------------------------------------------------------------------

function majorOf(version: string): string {
  return version.trim().split('.')[0] ?? version
}

/**
 * Resolve a locally installed copy of `assets.package` from
 * `assets.resolveFrom`'s dependency graph and return its assets directory
 * (`<pkg root>/<assets.path>`), or `undefined` when the package (or the
 * directory) is absent. A different installed version warns (`DF0061`);
 * a different **major** throws (`DF0060`).
 */
export function resolveInstalledRemoteAssets(assets: RemoteAssets): string | undefined {
  if (!assets.resolveFrom)
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
    if (majorOf(installed) !== majorOf(assets.version))
      throw diagnostics.DF0060({ package: assets.package, required: assets.version, installed })
    diagnostics.DF0061({ package: assets.package, required: assets.version, installed })
  }
  const dir = join(dirname(pkgJsonPath), assets.path ?? 'dist')
  return existsSync(dir) ? dir : undefined
}

// ---------------------------------------------------------------------------
// Cache locations
// ---------------------------------------------------------------------------

/** `<storageDir>/.remote-assets` — the cache root under a host's project storage dir. */
export function remoteAssetsCacheRoot(projectStorageDir: string): string {
  return join(projectStorageDir, '.remote-assets')
}

/** Version-locked cache directory for one `pkg@version` under `cacheRoot`. */
export function remoteAssetsCacheDir(cacheRoot: string, assets: RemoteAssets): string {
  return join(cacheRoot, `${assets.package.replace(/\//g, '+')}@${assets.version}`)
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface CreateRemoteAssetsStoreOptions {
  /** Version-locked cache directory (see {@link remoteAssetsCacheDir}). */
  cacheDir: string
}

interface ResolvedFileStat {
  abs: string
  size: number
  mtime: Date
}

async function statFile(abs: string): Promise<ResolvedFileStat | null> {
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

function contentTypeFor(filePath: string): string {
  const type = lookup(filePath)
  if (!type)
    return 'application/octet-stream'
  if (type === 'text/html')
    return 'text/html; charset=utf-8'
  return type
}

/**
 * Clean a request path into a safe, package-relative POSIX path (no leading
 * slash). Returns `null` for malformed or traversal-escaping paths.
 */
function cleanRequestPath(urlPath: string): string | null {
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
  // Normalize and reject anything that escapes the root.
  const normalized = normalize(cleaned)
  if (normalized === '..' || normalized.startsWith(`..${sep}`) || normalized.startsWith('/'))
    return null
  return normalized === '.' ? '' : normalized
}

/**
 * Candidate package-relative file paths for a request, in resolution order —
 * mirrors `devframe/utils/serve-static`: direct hit, directory index,
 * pretty-URL `.html`/`.htm`, then SPA fallback.
 */
function candidatePaths(prefix: string, cleaned: string, options: RemoteAssetsServeOptions | undefined): string[] {
  const indexNames = options?.indexNames ?? ['index.html']
  const single = options?.single ?? true
  const candidates: string[] = []
  if (cleaned)
    candidates.push(prefix + cleaned)
  for (const name of indexNames)
    candidates.push(prefix + (cleaned ? `${cleaned}/` : '') + name)
  if (cleaned && !extname(cleaned)) {
    for (const ext of HTML_EXTENSIONS)
      candidates.push(prefix + cleaned + ext)
  }
  const fallbackIndex = indexNames[0]
  if (single && fallbackIndex && !/\.[a-z0-9]+$/i.test(cleaned)) {
    const fallback = prefix + fallbackIndex
    if (!candidates.includes(fallback))
      candidates.push(fallback)
  }
  return candidates
}

/** Create the servable, caching back-proxy for one {@link RemoteAssets} declaration. */
export function createRemoteAssetsStore(
  assets: RemoteAssets,
  options: CreateRemoteAssetsStoreOptions,
): RemoteAssetsStore {
  const normalized = { ...assets, path: assets.path ?? 'dist' }
  const provider = resolveProvider(assets)
  const fetchImpl = assets.fetch ?? globalThis.fetch
  const cacheDir = resolve(options.cacheDir)
  const prefix = normalized.path ? `${normalized.path}/` : ''

  let manifestPromise: Promise<Set<string> | null> | undefined
  let manifestFailureReported = false

  async function loadManifest(): Promise<Set<string> | null> {
    const manifestFile = join(cacheDir, MANIFEST_FILENAME)
    try {
      const cached = JSON.parse(await readFile(manifestFile, 'utf8')) as string[]
      return new Set(cached)
    }
    catch {
      // absent / corrupt — refetch below
    }
    if (assets.offline || !provider.listFiles)
      return null
    try {
      const files = await provider.listFiles(normalized.package, normalized.version, fetchImpl)
      await mkdir(cacheDir, { recursive: true })
      await writeFile(manifestFile, JSON.stringify(files), 'utf8').catch(() => {})
      return new Set(files)
    }
    catch (error) {
      if (!manifestFailureReported) {
        manifestFailureReported = true
        diagnostics.DF0058({
          package: normalized.package,
          version: normalized.version,
          provider: providerName(assets),
          reason: error instanceof Error ? error.message : String(error),
          cause: error,
        })
      }
      return null
    }
  }

  function getManifest(): Promise<Set<string> | null> {
    manifestPromise ??= loadManifest()
    return manifestPromise
  }

  async function serveCached(filePath: string): Promise<RemoteAssetsServedFile | null> {
    const file = await statFile(join(cacheDir, filePath))
    if (!file)
      return null
    return {
      headers: {
        'Content-Type': contentTypeFor(filePath),
        'Content-Length': String(file.size),
        'Last-Modified': file.mtime.toUTCString(),
        'Cache-Control': 'no-store',
      },
      stream: () => Readable.toWeb(createReadStream(file.abs)) as ReadableStream<Uint8Array>,
      cancel: () => {},
    }
  }

  /** Write `body` to the cache at `filePath` (tmp + rename); failures warn (`DF0062`). */
  async function persist(filePath: string, body: ReadableStream<Uint8Array>): Promise<void> {
    const target = join(cacheDir, filePath)
    const tmp = `${target}.${Math.random().toString(36).slice(2)}.tmp`
    try {
      await mkdir(dirname(target), { recursive: true })
      const chunks: Uint8Array[] = []
      const reader = body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break
        chunks.push(value)
      }
      await writeFile(tmp, Buffer.concat(chunks))
      await rename(tmp, target)
    }
    catch (error) {
      await rm(tmp, { force: true }).catch(() => {})
      diagnostics.DF0062({
        filepath: target,
        reason: error instanceof Error ? error.message : String(error),
        cause: error,
      })
    }
  }

  /**
   * Fetch `filePath` through the provider: `null` on 404, a served file
   * (client branch of the teed body, cache write in the background) on 200,
   * throws (`DF0059`) otherwise.
   */
  async function serveRemote(filePath: string): Promise<RemoteAssetsServedFile | null> {
    const url = provider.fileUrl(normalized.package, normalized.version, filePath)
    let res: Response
    try {
      res = await fetchImpl(url)
    }
    catch (error) {
      throw diagnostics.DF0059({
        url,
        package: normalized.package,
        reason: error instanceof Error ? error.message : String(error),
        cause: error,
      })
    }
    if (res.status === 404) {
      await res.body?.cancel().catch(() => {})
      return null
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => {})
      throw diagnostics.DF0059({ url, package: normalized.package, reason: `HTTP ${res.status}` })
    }
    const [toClient, toCache] = res.body.tee()
    // Fire-and-forget: the cache write must not block (or fail) the response.
    void persist(filePath, toCache)
    const length = res.headers.get('content-length')
    return {
      headers: {
        'Content-Type': contentTypeFor(filePath),
        ...(length ? { 'Content-Length': length } : {}),
        'Cache-Control': 'no-store',
      },
      stream: () => toClient,
      cancel: () => {
        void toClient.cancel().catch(() => {})
      },
    }
  }

  async function serve(urlPath: string, serveOptions?: RemoteAssetsServeOptions): Promise<RemoteAssetsServedFile | null> {
    const cleaned = cleanRequestPath(urlPath)
    if (cleaned === null)
      return null
    const candidates = candidatePaths(prefix, cleaned, serveOptions)
    const manifest = await getManifest()

    if (manifest) {
      const filePath = candidates.find(candidate => manifest.has(candidate))
      if (!filePath)
        return null
      const cached = await serveCached(filePath)
      if (cached)
        return cached
      if (assets.offline)
        throw diagnostics.DF0059({ url: filePath, package: normalized.package, reason: 'offline: true and the file is not in the cache' })
      return serveRemote(filePath)
    }

    // Probe mode (no file listing): cache first, then walk the candidates
    // against the provider directly.
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
    if (!provider.listFiles) {
      throw diagnostics.DF0063({
        package: normalized.package,
        version: normalized.version,
        reason: 'the configured provider has no file listing (`listFiles`)',
      })
    }
    let files: string[]
    try {
      files = await provider.listFiles(normalized.package, normalized.version, fetchImpl)
    }
    catch (error) {
      throw diagnostics.DF0063({
        package: normalized.package,
        version: normalized.version,
        reason: error instanceof Error ? error.message : String(error),
        cause: error,
      })
    }
    const wanted = files.filter(file => file.startsWith(prefix))
    for (const filePath of wanted) {
      const rel = filePath.slice(prefix.length)
      const target = join(targetDir, rel)
      const url = provider.fileUrl(normalized.package, normalized.version, filePath)
      let res: Response
      try {
        res = await fetchImpl(url)
        if (!res.ok)
          throw new Error(`HTTP ${res.status}`)
      }
      catch (error) {
        throw diagnostics.DF0063({
          package: normalized.package,
          version: normalized.version,
          reason: `failed to download ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        })
      }
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, Buffer.from(await res.arrayBuffer()))
    }
  }

  return {
    kind: 'remote-assets-store',
    assets: normalized,
    cacheDir,
    serve,
    materialize,
  }
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

export interface ResolveStaticAssetsSourceOptions {
  /**
   * Cache root remote sources persist under — conventionally
   * `remoteAssetsCacheRoot(host.getStorageDir('project'))`.
   */
  cacheRoot: string
}

/**
 * Normalize a {@link StaticAssetsSource} into something servable: a local
 * directory (string sources pass through; remote sources short-circuit to a
 * locally installed copy of their package when present) or a
 * {@link RemoteAssetsStore} back-proxy.
 */
export function resolveStaticAssetsSource(
  source: StaticAssetsSource,
  options: ResolveStaticAssetsSourceOptions,
): string | RemoteAssetsStore {
  if (typeof source === 'string')
    return source
  const installed = resolveInstalledRemoteAssets(source)
  if (installed)
    return installed
  return createRemoteAssetsStore(source, {
    cacheDir: remoteAssetsCacheDir(options.cacheRoot, source),
  })
}

// ---------------------------------------------------------------------------
// Error page
// ---------------------------------------------------------------------------

/**
 * Minimal, dependency-free HTML shown when a remote-assets request cannot
 * be satisfied (no installed package, no cache, provider unreachable).
 */
export function renderRemoteAssetsErrorPage(input: { package: string, version: string, reason: string }): string {
  const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const pkg = escape(input.package)
  const version = escape(input.version)
  const reason = escape(input.reason)
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
  code { font: 12px/1.6 ui-monospace, monospace; background: rgb(125 125 125 / .12); border-radius: 4px; padding: .1em .4em; }
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
  <p>The UI for this tool is served from <code>${pkg}@${version}</code>, which could not be reached.</p>
  <pre>${reason}</pre>
  <p>To use it without network access, install the assets package locally:</p>
  <pre>npm install ${pkg}@${version}</pre>
  <button onclick="location.reload()">Retry</button>
  <p class="muted">devframe remote assets</p>
</main>
</body>
</html>
`
}
