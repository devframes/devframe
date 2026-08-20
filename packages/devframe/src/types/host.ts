// DevframeHost — abstraction over the runtime that serves the Devframe
// UI and RPC endpoints (Vite dev server, standalone h3 CLI server, static
// snapshot, embedded, etc.).
//
// Host classes (docks, views, ...) call into this interface so they stay
// framework-neutral. The h3-backed implementation
// (`packages/devframe/src/node/host-h3.ts`) serves every standalone runtime
// (CLI dev server, static build, embedded); hosted runtimes provide their own
// (e.g. `@devframes/vite`).

import type { RemoteAssetsStore } from './remote-assets'

export interface DevframeHost {
  /**
   * Serve static assets at the given URL base — a local directory, or a
   * resolved {@link RemoteAssetsStore} back-proxy. Called by
   * `DevframeViewHost.hostStatic` (which normalizes `RemoteAssets`
   * declarations into stores first). Implementations map this to whatever
   * the underlying runtime expects (Vite middleware, h3 handler, no-op
   * for build snapshots) — the shared engine in
   * `devframe/utils/serve-static` accepts either shape.
   */
  mountStatic: (base: string, source: string | RemoteAssetsStore) => void | Promise<void>

  /**
   * Serve the host's connection meta (`__connection.json`) at the given URL
   * base, so a devframe SPA mounted there can discover the RPC/WS endpoint
   * via `connectDevframe()`'s relative `./__connection.json` fetch.
   *
   * Called by `ctx.install` for each mounted devframe (alongside
   * `mountStatic`). Without it, an embedded SPA can only discover the
   * endpoint by inheriting it from a same-origin parent window — which fails
   * for cross-origin or sandboxed iframes. Implementations serve the same
   * meta they expose at the hub's own base.
   *
   * Optional in the type, but a host that mounts a devframe with servable
   * `clientAssets` yet omits this hook triggers a `DF8106` diagnostic, since the
   * SPA's `./__connection.json` fetch would otherwise fall through and break
   * silently. A static-snapshot host that bakes the meta into its served files
   * can implement it as a no-op to acknowledge this intentionally.
   */
  mountConnectionMeta?: (base: string) => void | Promise<void>

  /**
   * Return the public origin the host is reachable at, e.g.
   * `http://localhost:5173`. Used by the dock host to enrich remote
   * iframe URLs with a full `origin`. Called only when a dock needs an
   * absolute URL; hosts that never serve remote docks can return any
   * reasonable value.
   */
  resolveOrigin: () => string

  /**
   * Resolve a directory the host owns for persisted devframe state.
   * Each host picks its own app-name namespace so storage doesn't
   * collide between, say, the Vite host (`.vite/devframe`) and a
   * standalone CLI host (`.<appName>/devframe`).
   *
   *   - `workspace` — state shared with the whole team through version
   *     control (saved queries, shared presets). Conventionally
   *     `${workspaceRoot}/.devframe/`; hosts must place it somewhere
   *     committable.
   *   - `project`   — per-checkout private state (caches, personal
   *     settings). Typically under
   *     `${cwd}/node_modules/.<appName>/devframe/`, which version
   *     control ignores.
   *   - `global`    — per-user state (auth tokens, machine-wide
   *     preferences). Typically under
   *     `${homedir()}/.<appName>/devframe/`.
   *
   * Implementations should ensure the directory exists or be safe to
   * pass to a downstream `createStorage(...)` call that creates it
   * lazily.
   */
  getStorageDir: (scope: DevframeStorageScope) => string
}

/**
 * Storage placement classes for {@link DevframeHost.getStorageDir}:
 * `workspace` is committable and team-shared, `project` is per-checkout
 * private, `global` is per-user.
 */
export type DevframeStorageScope = 'workspace' | 'project' | 'global'
