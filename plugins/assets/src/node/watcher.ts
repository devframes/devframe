import type { DevframeNodeContext } from 'devframe/types'
import { watch } from 'chokidar'
import { debounce } from 'perfect-debounce'
import { CHANGED_EVENT } from '../constants'

// Never descend into these — following a symlink or a stray copy of one of
// these into the managed directory would otherwise make chokidar walk a huge
// tree (a common cause of dev-server OOM).
const IGNORED_RE = /(?:^|[/\\])(?:node_modules|\.git|\.nuxt|\.output|\.turbo|\.cache|dist)(?:[/\\]|$)/

/**
 * Watch the managed directory and broadcast {@link CHANGED_EVENT} (debounced)
 * whenever a file is added, removed, or changed, so connected UIs refresh
 * their listing live. Returns a disposer; call it when the devframe shuts
 * down — a leaked watcher keeps the process alive and, when a host (Nuxt /
 * Vite) recreates the dev bridge across reloads, accumulates until the
 * process runs out of heap.
 */
export function watchAssetsDir(ctx: DevframeNodeContext, dir: string): () => Promise<void> {
  const notify = debounce(async () => {
    await ctx.rpc.broadcast({ method: CHANGED_EVENT, args: [] } as never)
  }, 300)

  const watcher = watch(dir, {
    ignoreInitial: true,
    // Don't traverse symlinks — a link pointing at `node_modules` (or a
    // parent dir) would otherwise blow up memory / inotify watches.
    followSymlinks: false,
    ignorePermissionErrors: true,
    ignored: (path: string) => IGNORED_RE.test(path),
    // A managed asset dir is shallow in practice; cap depth so a misconfigured
    // `dir` (e.g. a project root) can't make the initial scan runaway.
    depth: 16,
  })
  watcher
    .on('add', () => void notify())
    .on('unlink', () => void notify())
    .on('addDir', () => void notify())
    .on('unlinkDir', () => void notify())
    .on('change', () => void notify())

  return () => watcher.close()
}
