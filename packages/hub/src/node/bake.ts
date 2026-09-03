/* eslint-disable no-console */
import type { ConnectionMeta } from 'devframe/types'
import type { ClientScriptEntry } from '../types/docks'
import type { DevframeHubContext } from './context'
import type { DevframeHubUi, DockRendererRegistration } from './initiate'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { DEVFRAME_CONNECTION_META_FILENAME, DEVFRAME_DOCK_IMPORTS_FILENAME } from 'devframe/constants'
import { collectStaticRpcDump, writeStaticRpcDump } from 'devframe/rpc/dump'
import { colors as c } from 'devframe/utils/colors'
import { resolveStaticAssetsSource } from 'devframe/utils/remote-assets'
import { dirname, resolve } from 'pathe'
import { joinURL } from 'ufo'
import { DEVFRAMES_HUB_BASE, DOCK_RENDERERS_STATE_KEY, normalizeHubBase } from '../constants'
import { renderClientImportsModule, resolveRendererRegistrations } from './assemble'
import { diagnostics } from './diagnostics'

export interface BakeHubStaticOptions {
  /**
   * Output directory the hub subtree is written into, the on-disk counterpart
   * of {@link BakeHubStaticOptions.base}.
   */
  outDir: string
  /**
   * Mount base the deployed hub answers under, baked into every absolute URL
   * the build emits. Default: `/__devframes/`.
   */
  base?: string
  /**
   * The hub's UI slot: its viewer SPA is copied to the hub base, `embedded.js`
   * next to it, and any produced assets written. `setup(ctx)` is the caller's
   * responsibility (it must run before baking so its static config is in the
   * connection meta).
   */
  ui?: DevframeHubUi
  /** Prebuilt dock-renderer modules, copied to `<base>__renderers/<type>.mjs`. */
  renderers?: readonly DockRendererRegistration[]
  /** Name written into `<base>__index.json`. */
  name?: string
  /** Version written into `<base>__index.json`. */
  version?: string
  /** Pretty-print RPC dump JSON files. Default: `false` (minified shards). */
  pretty?: boolean
  /**
   * Remove {@link BakeHubStaticOptions.outDir} before writing. Default `true`,
   * matching a from-scratch build. Pass `false` to bake into a directory that
   * already holds sibling output (an app's own `dist/` the hub subtree lives
   * beside).
   */
  clean?: boolean
}

/**
 * Bake an already-mounted hub context into a self-contained static deploy: the
 * tail half of `buildHub` factored out so a host that assembled and mounted the
 * context itself (Vite DevTools' kit-augmented context, a devframe mounted from
 * a Vite plugin's `devtools.setup`) reuses the exact baker instead of
 * reimplementing it.
 *
 * The caller owns context creation, devframe mounting, `configure`, and the UI
 * slot's `setup`; this reads what they left behind:
 *
 *   - copies every static registered through `ctx.views.hostStatic` (frame
 *     SPAs, page scripts, hub statics) from `ctx.views.buildStaticDirs`;
 *   - publishes the renderer manifest and copies the renderer modules;
 *   - copies the UI slot's viewer SPA, `embedded.js`, and produced assets;
 *   - writes the discovery documents (`__client-imports.js`, `__index.json`
 *     from `ctx.frames`);
 *   - writes `__connection.json` (`{ backend: 'static' }`) at the hub base and
 *     at every frame base that served its own SPA;
 *   - bakes the shared RPC dump under `<outDir>/__rpc-dump/`.
 */
export async function bakeHubStatic(ctx: DevframeHubContext, options: BakeHubStaticOptions): Promise<void> {
  const base = normalizeHubBase(options.base ?? DEVFRAMES_HUB_BASE)
  const outDir = resolve(options.outDir)
  const rendererRegistrations = resolveRendererRegistrations(options.renderers ?? [])

  if (options.clean !== false && existsSync(outDir))
    await fs.rm(outDir, { recursive: true })
  await fs.mkdir(outDir, { recursive: true })

  /** Map a hub-base-relative URL base to its on-disk location under `outDir`. */
  const resolveOutPath = (urlBase: string): string => {
    if (!urlBase.startsWith(base))
      throw diagnostics.DF8006({ urlBase, base })
    return resolve(outDir, urlBase.slice(base.length))
  }

  await copyBuildStatics(ctx, resolveOutPath)
  await publishRendererManifest(ctx, rendererRegistrations, base, outDir)
  await writeUiArtifacts(options.ui, outDir)
  await fs.writeFile(resolve(outDir, DEVFRAME_DOCK_IMPORTS_FILENAME), renderClientImportsModule(ctx), 'utf-8')
  await writeHubIndex(ctx, base, outDir, options)
  await writeConnectionMetas(ctx, base, outDir, resolveOutPath)

  console.log(c.cyan`[devframes-hub] writing RPC dump to ${resolve(outDir, '__rpc-dump')}`)
  const dump = await collectStaticRpcDump(ctx.rpc.definitions.values(), ctx)
  await writeStaticRpcDump(dump, outDir, { pretty: options.pretty })

  const count = ctx.frames.length
  console.log(c.green`[devframes-hub] built ${count} devframe${count === 1 ? '' : 's'} -> ${outDir}`)
}

/**
 * Copy every static the context registered through `ctx.views.hostStatic`
 * (recorded in `ctx.views.buildStaticDirs`): a local dir verbatim, a remote
 * source by materializing every listed file. Reads the list rather than
 * relying on a live host `mountStatic`, so a context whose host baked no
 * statics at mount time (a kit build host) still gets its assets copied.
 */
async function copyBuildStatics(ctx: DevframeHubContext, resolveOutPath: (urlBase: string) => string): Promise<void> {
  const storageDir = ctx.host.getStorageDir('project')
  for (const { baseUrl, source, resolveFrom } of ctx.views.buildStaticDirs) {
    const target = resolveOutPath(baseUrl)
    const resolved = resolveStaticAssetsSource(source, storageDir, resolveFrom)
    await fs.mkdir(dirname(target), { recursive: true })
    if (typeof resolved === 'string')
      await fs.cp(resolved, target, { recursive: true })
    else
      await resolved.materialize(target)
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
      ...(registration.importName ? { importName: registration.importName } : {}),
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
  options: BakeHubStaticOptions,
): Promise<void> {
  await fs.writeFile(resolve(outDir, '__index.json'), `${JSON.stringify({
    name: options.name,
    version: options.version,
    base,
    frames: ctx.frames.map(({ id, base, title }) => ({ id, base, title })),
    endpoints: {
      connection: DEVFRAME_CONNECTION_META_FILENAME,
      clientImports: DEVFRAME_DOCK_IMPORTS_FILENAME,
      index: '__index.json',
      ...(options.ui?.embedded ? { embedded: 'embedded.js' } : {}),
    },
  }, null, 2)}\n`, 'utf-8')
}

/**
 * Write the `backend: 'static'` connection meta at the hub base, and a copy at
 * every frame base that served its own SPA whose `baseUrl` points relative
 * resolution (the RPC dump) back at the hub's own meta, so a frame SPA that
 * fetched its per-frame copy (instead of inheriting the host page's connection)
 * still finds the shared dump.
 */
async function writeConnectionMetas(
  ctx: DevframeHubContext,
  base: string,
  outDir: string,
  resolveOutPath: (urlBase: string) => string,
): Promise<void> {
  const jsonSerializableMethods: string[] = []
  for (const def of ctx.rpc.definitions.values()) {
    if (def.jsonSerializable === true)
      jsonSerializableMethods.push(def.name)
  }
  const meta: ConnectionMeta = {
    backend: 'static',
    jsonSerializableMethods,
    ...(Object.keys(ctx.staticConfig).length > 0 ? { configs: ctx.staticConfig } : {}),
  }
  await fs.writeFile(resolve(outDir, DEVFRAME_CONNECTION_META_FILENAME), JSON.stringify(meta, null, 2), 'utf-8')
  const frameMeta: ConnectionMeta = { ...meta, baseUrl: joinURL(base, DEVFRAME_CONNECTION_META_FILENAME) }
  for (const frame of ctx.frames) {
    if (!frame.hasClientAssets)
      continue
    const target = resolve(resolveOutPath(frame.base), DEVFRAME_CONNECTION_META_FILENAME)
    await fs.mkdir(dirname(target), { recursive: true })
    await fs.writeFile(target, JSON.stringify(frameMeta, null, 2), 'utf-8')
  }
}
