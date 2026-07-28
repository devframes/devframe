import type { DevframeNodeContext } from 'devframe/types'
import { existsSync } from 'node:fs'
import fsp from 'node:fs/promises'
import { UPLOAD_CHANNEL } from '../rpc/functions/upload'
import { alwaysFunctions, readFunctions, writeFunctions } from '../rpc/index'
import { configureAssets } from './context'
import { watchAssetsDir } from './watcher'

export interface SetupAssetsOptions {
  /** Directory this devframe manages. */
  dir: string
  /** Whether upload / rename / delete / mkdir are registered. */
  write: boolean
  /** Extensions `upload` accepts, or `'*'` to accept any. */
  uploadExtensions: readonly string[] | '*'
  /** URL prefix the raw bytes are mounted at (live adapters only). */
  rawBase: string
}

const watchers = new WeakMap<DevframeNodeContext, () => Promise<void>>()

/**
 * Register the assets RPC surface on a devframe node context: ensures the
 * managed directory exists, hosts it for raw byte access, registers the
 * read RPCs (always) and write RPCs (when enabled), and starts a live
 * file watcher in dev mode.
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

  // Real byte serving for `<img>`/`<video>`/`<a download>` etc. Only
  // meaningful under a live adapter (cli / vite / embedded) — a no-op
  // under `mode: 'build'`, which this plugin opts out of by default via
  // `capabilities.build: false` anyway.
  ctx.views.hostStatic(options.rawBase, options.dir)

  for (const fn of readFunctions)
    ctx.rpc.register(fn)
  for (const fn of alwaysFunctions)
    ctx.rpc.register(fn)
  if (options.write) {
    for (const fn of writeFunctions)
      ctx.rpc.register(fn)
  }

  if (ctx.mode === 'dev')
    watchers.set(ctx, watchAssetsDir(ctx, options.dir))
}

/**
 * Stop the live file watcher started by {@link setupAssets}. Test harnesses
 * wrap their dev-server `close()` with this — see `test/_utils.ts` — so a
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
