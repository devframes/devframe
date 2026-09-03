import type { DevframeNodeContext } from 'devframe'
import { existsSync } from 'node:fs'
import fsp from 'node:fs/promises'
import { UPLOAD_CHANNEL } from '../rpc/functions/upload'
import { readFunctions, writeFunctions } from '../rpc/index'
import { configureAssets } from './context'
import { watchAssetsDir } from './watcher'

export interface SetupAssetsOptions {
  /** Directory this devframe manages. */
  dir: string
  /** Whether upload / rename / delete / mkdir are registered. */
  write: boolean
  /** Extensions `upload` accepts, or `'*'` to accept any. */
  uploadExtensions: readonly string[] | '*'
  /**
   * URL base the managed directory is served at, the base every asset's
   * `publicPath` is resolved against.
   */
  baseURL: string
  /**
   * Whether this devframe should serve the managed directory's bytes
   * itself. Left `false` when mounted into a host (Vite / Nuxt / …) that
   * already serves `public/` at {@link baseURL}; set `true` only for the
   * standalone CLI, which is its own host.
   */
  serveStatic: boolean
  /** Start the live file watcher (dev mode only). */
  watch: boolean
}

const watchers = new WeakMap<DevframeNodeContext, () => Promise<void>>()

/**
 * Register the assets RPC surface on a devframe node context: ensures the
 * managed directory exists, registers the read RPCs (always) and write
 * RPCs (when enabled), and starts a live file watcher in dev mode.
 *
 * Raw asset bytes (for `<img>`/`<video>`/download previews) are served by
 * the **host** the plugin is attached to: Vite, Nuxt, or any framework
 * already serves its `public/` dir at {@link SetupAssetsOptions.baseURL}.
 * The plugin only serves them itself when `serveStatic` is set (the
 * standalone CLI, which is its own host).
 *
 * Called from the definition's `setup(ctx)` and reusable by host adapters
 * that wire their own context.
 */
export async function setupAssets(ctx: DevframeNodeContext, options: SetupAssetsOptions): Promise<void> {
  if (!existsSync(options.dir))
    await fsp.mkdir(options.dir, { recursive: true })

  const uploadChannel = options.write
    ? ctx.rpc.streaming.create<Uint8Array>(UPLOAD_CHANNEL)
    : undefined

  configureAssets(ctx, { ...options, uploadChannel })

  // Only self-serve when this devframe is its own host (the standalone
  // CLI). When attached to a Vite/Nuxt/etc. dev server, that host already
  // serves the managed directory at `baseURL`, so we reference its URLs
  // rather than mounting our own route.
  if (options.serveStatic)
    ctx.views.hostStatic(options.baseURL, options.dir)

  for (const fn of readFunctions)
    ctx.rpc.register(fn)
  if (options.write) {
    for (const fn of writeFunctions)
      ctx.rpc.register(fn)
  }

  if (ctx.mode === 'dev' && options.watch)
    watchers.set(ctx, watchAssetsDir(ctx, options.dir))
}

/**
 * Stop the live file watcher started by {@link setupAssets}. Test harnesses
 * wrap their dev-server `close()` with this (see `test/_utils.ts`), so a
 * leaked chokidar watcher doesn't keep the process alive.
 */
export async function disposeAssetsWatcher(ctx: DevframeNodeContext): Promise<void> {
  const dispose = watchers.get(ctx)
  if (!dispose)
    return
  watchers.delete(ctx)
  await dispose()
}

export { configureAssets, getAssetsContext } from './context'
export { resolveAssetPath } from './paths'
export { guessAssetType, scanAssets } from './scanner'
