/* eslint-disable no-console */
import type { ConnectionMeta, DevframeServiceInput, DevframeStorageScope, DevframeTracingOptions } from 'devframe/types'
import type { ClientScriptEntry } from '../types/docks'
import type { CreateHubContextOptions, DevframeHubContext } from './context'
import type { DevframeHubUi, DevframesInput, DockRendererRegistration } from './initiate'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import process from 'node:process'
import { DEVFRAME_CONNECTION_META_FILENAME, DEVFRAME_DOCK_IMPORTS_FILENAME } from 'devframe/constants'
import { createH3DevframeHost } from 'devframe/internal'
import { collectStaticRpcDump, writeStaticRpcDump } from 'devframe/rpc/dump'
import { colors as c } from 'devframe/utils/colors'
import { resolveStaticAssetsSource } from 'devframe/utils/remote-assets'
import { joinURL } from 'devframe/utils/url'
import { dirname, extname, resolve } from 'pathe'
import { DEVFRAMES_HUB_BASE, DOCK_RENDERERS_STATE_KEY, normalizeHubBase } from '../constants'
import { mountDevframes, renderClientImportsModule, resolveDevframesInput, resolveRendererRegistrations } from './assemble'
import { createHubContext } from './context'
import { diagnostics } from './diagnostics'

export interface BuildHubOptions {
  /**
   * Output directory the hub subtree is written into. It corresponds to the
   * hub {@link BuildHubOptions.base} at serve time: building with
   * `base: '/__devframes/'` into `dist/__devframes` makes the deployed app's
   * `dist/` servable as-is by any static file server. A mount served outside
   * the hub base (a devframe SPA or asset dir kept as a sibling of it) is
   * written to this directory's parent (the deploy root) by its absolute path,
   * so `dist/` still serves the whole layout.
   */
  outDir: string
  /**
   * Mount base the deployed hub answers under (baked into every absolute URL
   * the build emits: page-script rewrites, renderer modules, per-frame meta
   * pointers). Default: `/__devframes/`.
   */
  base?: string
  /**
   * URL prefix the deploy root is served under (e.g. `/ci-build-123456/`).
   * Root-absolute URLs the build emits are rebased under it, so the output
   * works below the domain root. Must be a prefix of
   * {@link BuildHubOptions.base}. Default: `/`.
   */
  deployBase?: string
  /** Devframes to bake as docks, same input as `initHub({ devframes })`. */
  devframes?: DevframesInput
  /**
   * Bring your own already-mounted hub context instead of `devframes`, the
   * build counterpart of `initHub({ context })`: a host that assembled
   * `createHubContext` + `ctx.install` itself (Vite DevTools' kit-augmented
   * context, devframes mounted from Vite plugins) hands the mounted context
   * here and `buildHub` bakes it, reading `ctx.frames` and
   * `ctx.views.buildStaticDirs` for what to emit. `configure` and the UI
   * slot's `setup` still run against it, so pass them here rather than running
   * them yourself. Mutually exclusive with `devframes`.
   */
  context?: DevframeHubContext
  /** Host-level wire services, same contract as `initHub({ services })`. */
  services?: DevframeServiceInput[]
  /** Host-level Tracing Channels, same contract as `initHub({ tracing })`. */
  tracing?: DevframeTracingOptions
  /** Extra RPC declarations registered at context creation. */
  rpcDeclarations?: CreateHubContextOptions['builtinRpcDeclarations']
  /**
   * Runs once the context exists and every `devframes` entry is mounted;
   * register docks, commands, and messages surfaces here, exactly like
   * `initHub({ configure })`. Everything it registers is baked into the
   * static shared-state snapshot.
   */
  configure?: (ctx: DevframeHubContext) => void | Promise<void>
  /**
   * The hub's UI slot: the viewer SPA is copied to the hub base, the
   * `embedded.js` bootstrap next to it, and `setup(ctx)` runs so its static
   * config (branding, dock preferences) is baked into the connection meta.
   */
  ui?: DevframeHubUi
  /** Prebuilt dock-renderer modules, copied to `<base>__renderers/<type>.mjs`. */
  renderers?: readonly DockRendererRegistration[]
  /** Name written into `<base>__index.json`. */
  name?: string
  /** Version written into `<base>__index.json`. */
  version?: string
  /** Working directory for the hub context. Default: `process.cwd()`. */
  cwd?: string
  /** Override where persisted devframe state lives during the build. */
  getStorageDir?: (scope: DevframeStorageScope) => string
  /** Pretty-print RPC dump JSON files. Default: `false` (minified shards). */
  pretty?: boolean
  /**
   * Remove {@link BuildHubOptions.outDir} before writing. Default `true`,
   * matching a from-scratch build. Pass `false` to bake into a directory that
   * already holds sibling output (an app's own `dist/` the hub subtree lives
   * beside).
   */
  clean?: boolean
}

/**
 * Produce a self-contained static deploy of a whole hub, the multi-devframe
 * counterpart of devframe's `createBuild`:
 *
 *   - Build a `mode: 'build'` hub context and mount every devframe (or reuse a
 *     `context` a host mounted itself): each SPA is copied to `<outDir>/<id>/`,
 *     an absolute-path page script to `<outDir>/<id>/__page-script/`, and its
 *     `setup(ctx)` runs.
 *   - Copy the UI slot's viewer SPA, `embedded.js`, and the renderer
 *     modules, and write the discovery documents (`__index.json`,
 *     `__client-imports.js`).
 *   - Write `__connection.json` (`{ backend: 'static' }`, carrying
 *     `ctx.staticConfig` as `configs`) at the hub base and at every frame
 *     base (each pointing back at the hub's own meta via `baseUrl`).
 *   - Bake the shared RPC dump under `<outDir>/__rpc-dump/`: every
 *     `static`/`snapshot` RPC plus a snapshot of each shared-state key
 *     (docks, commands, renderer manifest), so `createDevframeClientRuntime`
 *     and every frame SPA boot from the dump with no live server.
 *
 * Reads work from the baked dump; live writes (messages, terminals, commands
 * execution) have no server and degrade to no-ops in the clients.
 */
export async function buildHub(options: BuildHubOptions): Promise<void> {
  if (options.context && options.devframes?.length)
    throw diagnostics.DF8002()

  const base = normalizeHubBase(options.base ?? DEVFRAMES_HUB_BASE)
  const deployBase = normalizeHubBase(options.deployBase ?? '/')
  if (deployBase !== '/' && !base.startsWith(deployBase))
    throw diagnostics.DF8007({ base, deployBase })
  const cwd = options.cwd ?? process.cwd()
  const outDir = resolve(cwd, options.outDir)
  const rendererRegistrations = resolveRendererRegistrations(options.renderers ?? [])

  const ctx = options.context ?? await createAndMountContext(options, base, cwd)

  await options.configure?.(ctx)
  await options.ui?.setup?.(ctx)

  if (options.clean !== false && existsSync(outDir))
    await fs.rm(outDir, { recursive: true })
  await fs.mkdir(outDir, { recursive: true })

  /**
   * Map a served URL base to its on-disk location. A base under the hub
   * {@link base} writes into the hub subtree at `outDir` (so `outDir`
   * corresponds to the hub base). A base outside it is a deploy-root sibling:
   * `outDir`'s parent is the deploy root, and the base resolves under it by its
   * absolute path. This is the layout Vite DevTools serves, where devframe SPAs
   * and assets sit beside `/__devtools/` rather than under it. The deploy
   * prefix, when set, is stripped first: it moves the URLs, not the files.
   */
  const deployRoot = dirname(outDir)
  const hubBase = stripDeployBase(base, deployBase)
  const resolveOutPath = (urlBase: string): string => {
    const localBase = stripDeployBase(urlBase, deployBase)
    if (localBase.startsWith(hubBase))
      return resolve(outDir, localBase.slice(hubBase.length))
    if (!localBase.startsWith('/'))
      throw diagnostics.DF8006({ urlBase, base })
    return resolve(deployRoot, localBase.slice(1))
  }

  // Everything served outside the deploy prefix needs it added to the baked
  // URLs. Longest first, so a nested mount is rewritten before its parent.
  const servedBases = new Set([
    ...ctx.frames.map(frame => frame.base),
    ...ctx.views.buildStaticDirs.map(dir => dir.baseUrl),
  ])
  const rewrites = deployBase === '/'
    ? []
    : [...servedBases]
        .filter(url => url.startsWith('/') && !isUnderDeployBase(url, deployBase))
        .sort((a, b) => b.length - a.length)
        .map(url => [
          url,
          serveUrl(url, deployBase),
        ] as const)
  const rebaseText = createTextRebaser(rewrites, deployBase)
  const rebaseValue = rewrites.length
    ? createUrlValueRebaser(rewrites)
    : <T>(value: T): T => value

  await copyBuildStatics(ctx, resolveOutPath, rewrites.length ? rebaseText : undefined)
  await publishRendererManifest(ctx, rendererRegistrations, base, outDir)
  await writeUiArtifacts(options.ui, outDir)
  await fs.writeFile(
    resolve(outDir, DEVFRAME_DOCK_IMPORTS_FILENAME),
    rebaseText(renderClientImportsModule(ctx)),
    'utf-8',
  )
  await writeHubIndex(ctx, base, outDir, options, deployBase)
  await writeConnectionMetas(ctx, base, outDir, resolveOutPath, rebaseValue)

  console.log(c.cyan`[devframes-hub] writing RPC dump to ${resolve(outDir, '__rpc-dump')}`)
  const dump = await collectStaticRpcDump(ctx.rpc.definitions.values(), ctx)
  for (const file of Object.values(dump.files))
    file.data = rebaseValue(file.data)
  await writeStaticRpcDump(dump, outDir, { pretty: options.pretty })

  const count = ctx.frames.length
  console.log(c.green`[devframes-hub] built ${count} devframe${count === 1
    ? ''
    : 's'} -> ${outDir}`)
}

/** File types that can carry absolute URLs. */
const TEXT_ASSET_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.svg',
])

/** Whether a root-absolute URL already sits under the deploy prefix. */
function isUnderDeployBase(url: string, deployBase: string): boolean {
  return deployBase === '/' || url === deployBase || url.startsWith(deployBase)
}

/**
 * `url` without the deploy prefix, so a served URL maps onto its on-disk
 * layout. The prefix moves URLs, not files.
 */
function stripDeployBase(url: string, deployBase: string): string {
  return deployBase !== '/' && url.startsWith(deployBase)
    ? `/${url.slice(deployBase.length)}`
    : url
}

/** Prefix a root-absolute URL with the deploy base. Idempotent. */
function serveUrl(url: string, deployBase: string): string {
  if (!url.startsWith('/') || isUnderDeployBase(url, deployBase))
    return url
  return joinURL(deployBase, url)
}

/**
 * Rewrite each URL prefix in a text asset, skipping occurrences that already
 * carry the deploy prefix.
 */
function createTextRebaser(
  rewrites: readonly (readonly [string, string])[],
  deployBase: string,
): (text: string) => string {
  if (!rewrites.length || deployBase === '/')
    return text => text
  const prefixedBefore = deployBase.slice(0, -1)
  return (text) => {
    let result = text
    for (const [from, to] of rewrites) {
      result = result.replaceAll(from, (match: string, offset: number, whole: string) => {
        const alreadyPrefixed = offset >= prefixedBefore.length
          && whole.startsWith(prefixedBefore, offset - prefixedBefore.length)
        return alreadyPrefixed ? match : to
      })
    }
    return result
  }
}

/** Rebase strings in an RPC payload that start with a registered URL prefix. */
function createUrlValueRebaser(
  rewrites: readonly (readonly [string, string])[],
): <T>(value: T) => T {
  const rebaseString = (value: string): string => {
    for (const [from, to] of rewrites) {
      if (value === from.slice(0, -1))
        return to.slice(0, -1)
      if (value.startsWith(from))
        return `${to}${value.slice(from.length)}`
    }
    return value
  }
  const visit = <T>(value: T): T => {
    if (typeof value === 'string')
      return rebaseString(value) as T
    if (Array.isArray(value))
      return value.map(item => visit(item)) as T
    if (value && typeof value === 'object') {
      const prototype = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null)
        return value
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          visit(item),
        ]),
      ) as T
    }
    return value
  }
  return visit
}

/** Rewrite the text assets under a copied static dir in place. */
async function rebaseTextAssets(dir: string, rebase: (text: string) => string): Promise<void> {
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !TEXT_ASSET_EXTENSIONS.has(extname(entry.name)))
      continue
    const filepath = resolve(entry.parentPath, entry.name)
    const text = await fs.readFile(filepath, 'utf-8')
    const next = rebase(text)
    if (next !== text)
      await fs.writeFile(filepath, next, 'utf-8')
  }
}

/**
 * Build a `mode: 'build'` hub context and mount the `devframes` input. The host
 * copies nothing live (`mountStatic`/`mountConnectionMeta` are no-ops): every
 * static is copied afterwards from `ctx.views.buildStaticDirs`, and each frame's
 * meta is written from `ctx.frames`.
 */
async function createAndMountContext(options: BuildHubOptions, base: string, cwd: string): Promise<DevframeHubContext> {
  const h3Host = createH3DevframeHost({
    origin: 'http://localhost',
    appName: 'devframes',
    workspaceRoot: cwd,
    mount: () => {},
  })
  const host = {
    ...h3Host,
    ...(options.getStorageDir
      ? { getStorageDir: options.getStorageDir }
      : {}),
    mountConnectionMeta: () => {},
  }

  const ctx = await createHubContext({
    cwd,
    workspaceRoot: cwd,
    mode: 'build',
    host,
    ...(options.rpcDeclarations
      ? { builtinRpcDeclarations: options.rpcDeclarations }
      : {}),
  })

  const devframes = await resolveDevframesInput(options.devframes ?? [])
  for (const input of options.services ?? [])
    void ctx.services.install(input)
  ctx.tracing._applyOptions(options.tracing)
  const setups = await mountDevframes(ctx, devframes, base)

  await ctx.services.ready()
  for (const run of setups)
    await run()

  return ctx
}

/**
 * Copy every static the context registered through `ctx.views.hostStatic`
 * (recorded in `ctx.views.buildStaticDirs`): a local dir verbatim, a remote
 * source by materializing every listed file. Reads the list rather than
 * relying on a live host `mountStatic`, so a context whose host copied no
 * statics at mount time (the build host, or a kit's) still gets its assets in.
 * Each source re-resolves with the `resolveFrom` it was mounted with, so a
 * remote source (e.g. a plugin's `--assets` package) resolves to the same
 * locally-installed copy it would serve live.
 */
async function copyBuildStatics(
  ctx: DevframeHubContext,
  resolveOutPath: (urlBase: string) => string,
  rebaseText?: (text: string) => string,
): Promise<void> {
  const storageDir = ctx.host.getStorageDir('project')
  for (const { baseUrl, source, resolveFrom } of ctx.views.buildStaticDirs) {
    const target = resolveOutPath(baseUrl)
    const resolved = resolveStaticAssetsSource(source, storageDir, resolveFrom)
    await fs.mkdir(dirname(target), { recursive: true })
    if (typeof resolved === 'string')
      await fs.cp(resolved, target, { recursive: true })
    else
      await resolved.materialize(target)
    if (rebaseText)
      await rebaseTextAssets(target, rebaseText)
  }
}

/**
 * Publish the renderer manifest exactly like `initHub` does, so it is baked
 * into the shared-state snapshot, and copy each prebuilt module to the URL
 * the manifest advertises.
 */
async function publishRendererManifest(
  ctx: DevframeHubContext,
  registrations: readonly DockRendererRegistration[],
  base: string,
  outDir: string,
): Promise<void> {
  const manifest: Record<string, ClientScriptEntry> = {}
  for (const registration of registrations) {
    manifest[registration.type] = {
      importFrom: joinURL(base, '__renderers', `${registration.type}.mjs`),
      ...(registration.importName
        ? { importName: registration.importName }
        : {}),
    }
    await fs.mkdir(resolve(outDir, '__renderers'), { recursive: true })
    await fs.copyFile(registration.file, resolve(outDir, '__renderers', `${registration.type}.mjs`))
  }
  const manifestState = await ctx.rpc.sharedState.get<Record<string, ClientScriptEntry>>(
    DOCK_RENDERERS_STATE_KEY,
    { initialValue: {} },
  )
  manifestState.mutate(() => manifest)
}

/**
 * Copy the UI slot's artifacts: the viewer SPA owns the hub base (copied
 * before the discovery documents, so those win over same-named files it
 * ships), `embedded.js` next to it, plus any produced assets.
 */
async function writeUiArtifacts(ui: DevframeHubUi | undefined, outDir: string): Promise<void> {
  if (ui?.viewer)
    await fs.cp(resolve(ui.viewer.distDir), outDir, { recursive: true })
  if (ui?.embedded)
    await fs.copyFile(resolve(ui.embedded.entry), resolve(outDir, 'embedded.js'))
  for (const [key, produce] of Object.entries(ui?.assets ?? {})) {
    const target = resolve(outDir, key)
    await fs.mkdir(dirname(target), { recursive: true })
    await fs.writeFile(target, produce())
  }
}

/** Write `<base>__index.json`: the discovery document listing every frame. */
async function writeHubIndex(
  ctx: DevframeHubContext,
  base: string,
  outDir: string,
  options: BuildHubOptions,
  deployBase: string,
): Promise<void> {
  await fs.writeFile(resolve(outDir, '__index.json'), `${JSON.stringify({
    name: options.name,
    version: options.version,
    base,
    frames: ctx.frames.map(({ id, base, title }) => ({
      id,
      base: serveUrl(base, deployBase),
      title,
    })),
    endpoints: {
      connection: DEVFRAME_CONNECTION_META_FILENAME,
      clientImports: DEVFRAME_DOCK_IMPORTS_FILENAME,
      index: '__index.json',
      ...(options.ui?.embedded
        ? { embedded: 'embedded.js' }
        : {}),
    },
  }, null, 2)}\n`, 'utf-8')
}

/**
 * Write the `backend: 'static'` connection meta at the hub base, and a copy at
 * every frame base that served its own SPA (i.e. registered a static mount at
 * that base) whose `baseUrl` points relative resolution (the RPC dump) back at
 * the hub's own meta, so a frame SPA that fetched its per-frame copy (instead
 * of inheriting the host page's connection) still finds the shared dump.
 */
async function writeConnectionMetas(
  ctx: DevframeHubContext,
  base: string,
  outDir: string,
  resolveOutPath: (urlBase: string) => string,
  rebaseValue: <T>(value: T) => T,
): Promise<void> {
  const jsonSerializableMethods: string[] = []
  for (const def of ctx.rpc.definitions.values()) {
    if (def.jsonSerializable === true)
      jsonSerializableMethods.push(def.name)
  }
  const meta: ConnectionMeta = rebaseValue({
    backend: 'static',
    jsonSerializableMethods,
    ...(Object.keys(ctx.staticConfig).length > 0
      ? { configs: ctx.staticConfig }
      : {}),
  } satisfies ConnectionMeta)
  await fs.writeFile(resolve(outDir, DEVFRAME_CONNECTION_META_FILENAME), JSON.stringify(meta, null, 2), 'utf-8')
  const frameMeta: ConnectionMeta = {
    ...meta,
    baseUrl: joinURL(base, DEVFRAME_CONNECTION_META_FILENAME),
  }
  // A frame served its own SPA exactly when it registered a static mount at its
  // base; only those need a per-frame meta beside the copied SPA.
  const servedBases = new Set(ctx.views.buildStaticDirs.map(dir => dir.baseUrl))
  for (const frame of ctx.frames) {
    if (!servedBases.has(frame.base))
      continue
    const target = resolve(resolveOutPath(frame.base), DEVFRAME_CONNECTION_META_FILENAME)
    await fs.mkdir(dirname(target), { recursive: true })
    await fs.writeFile(target, JSON.stringify(frameMeta, null, 2), 'utf-8')
  }
}
