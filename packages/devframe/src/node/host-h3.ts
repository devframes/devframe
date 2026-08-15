import type { DevframeHost } from '../types/host'
import type { RemoteAssetsStore } from '../types/remote-assets'
import { homedir } from 'node:os'
import process from 'node:process'
import { join } from 'pathe'

export interface CreateH3DevframeHostOptions {
  /**
   * Host the standalone server listens on, e.g. `http://localhost:9999`.
   * Consumed by `resolveOrigin` for dock entries that need an absolute URL.
   * Pass a function for hosts that only learn their public origin later
   * (e.g. `createHandler` derives it from the first incoming request).
   */
  origin: string | (() => string)
  /**
   * Register a static-file handler at `base` serving files from `source` —
   * a local directory or a resolved remote-assets back-proxy store (both
   * accepted by `devframe/utils/serve-static`). `mountStatic` forwards to
   * it; when omitted the host serves no SPA (bridge mode, where the SPA is
   * hosted elsewhere).
   */
  mount?: (base: string, source: string | RemoteAssetsStore) => void | Promise<void>
  /**
   * Namespace for storage paths returned by `getStorageDir`. Workspace
   * state (committable) lives under `${workspaceRoot}/.devframe/`, project
   * state under `${workspaceRoot}/node_modules/.<appName>/devframe/`, and
   * global state under `${homedir()}/.<appName>/devframe/`. Pick the
   * devtool's id (or another stable, filesystem-safe identifier) so the
   * standalone host doesn't collide with other tools' storage.
   */
  appName: string
  /**
   * Workspace root used as the parent of the per-project storage
   * directory. Defaults to `process.cwd()`.
   */
  workspaceRoot?: string
}

/**
 * h3-backed {@link DevframeHost} — used by the standalone CLI adapter.
 */
export function createH3DevframeHost(options: CreateH3DevframeHostOptions): DevframeHost {
  const workspaceRoot = options.workspaceRoot ?? process.cwd()
  return {
    mountStatic(base, source) {
      return options.mount?.(base, source)
    },
    resolveOrigin() {
      return typeof options.origin === 'function' ? options.origin() : options.origin
    },
    getStorageDir(scope) {
      const namespace = `.${options.appName}/devframe`
      if (scope === 'workspace')
        return join(workspaceRoot, '.devframe')
      if (scope === 'project')
        return join(workspaceRoot, 'node_modules', namespace)
      return join(homedir(), namespace)
    },
  }
}
