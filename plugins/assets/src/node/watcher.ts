import type { DevframeNodeContext } from 'devframe'
import process from 'node:process'
import { watch } from 'chokidar'
import { debounce } from 'perfect-debounce'
import { CHANGED_EVENT } from '../constants'

/**
 * Watch the managed directory and broadcast {@link CHANGED_EVENT} (debounced)
 * whenever a file is added, removed, or changed, so connected UIs refresh
 * their listing live. Returns a disposer; call it when the devframe shuts
 * down (tests in particular, since a leaked watcher keeps the process alive).
 */
export function watchAssetsDir(ctx: DevframeNodeContext, dir: string): () => Promise<void> {
  const notify = debounce(async () => {
    await ctx.rpc.broadcast({ method: CHANGED_EVENT, args: [] } as never)
  }, 300)

  const watcher = watch(dir, {
    ignoreInitial: true,
    /**
     * Directories can nest arbitrarily deep (icon sets, generated builds
     * dropped into the managed dir, …); chokidar's default depth is
     * unlimited, but pin a generous cap so a runaway symlink loop can't
     * spin the watcher forever.
     */
    depth: 32,
  })
  watcher
    .on('add', () => void notify())
    .on('unlink', () => void notify())
    .on('addDir', () => void notify())
    .on('unlinkDir', () => void notify())
    .on('change', () => void notify())

  return async () => {
    await watcher.close()
    // Windows: chokidar's close() can return before libuv retires the
    // outstanding ReadDirectoryChangesW request. If the watched dir is then
    // deleted, the stale completion trips a libuv assertion and crashes the
    // process. A short grace period lets the pending I/O settle first.
    if (process.platform === 'win32')
      await new Promise(resolve => setTimeout(resolve, 200))
  }
}
