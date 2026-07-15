// DevframeHost — abstraction over the runtime that serves the Devframe
// UI and RPC endpoints (Vite dev server, standalone h3 CLI server, static
// snapshot, embedded, etc.).
//
// Host classes (docks, views, ...) call into this interface so they stay
// framework-neutral. Concrete implementations live in each adapter:
//   - packages/kit/src/node/vite-host.ts — Vite-backed (dev mode)
//   - packages/devframe/src/node/host-h3.ts — h3 CLI server
//   - (build/spa/embedded) — added as the respective adapters land

export interface DevframeHost {
  /**
   * Serve a static directory at the given URL base. Called by
   * `DevframeViewHost.hostStatic`. Implementations map this to whatever
   * the underlying runtime expects (Vite middleware, h3 handler, no-op
   * for build snapshots).
   */
  mountStatic: (base: string, distDir: string) => void | Promise<void>

  /**
   * Serve the host's connection meta (`__connection.json`) at the given URL
   * base, so a devframe SPA mounted there can discover the RPC/WS endpoint
   * via `connectDevframe()`'s relative `./__connection.json` fetch.
   *
   * Called by `mountDevframe` for each mounted devframe (alongside
   * `mountStatic`). Without it, an embedded SPA can only discover the
   * endpoint by inheriting it from a same-origin parent window — which fails
   * for cross-origin or sandboxed iframes. Implementations serve the same
   * meta they expose at the hub's own base.
   *
   * Optional in the type, but a host that mounts a devframe with a servable
   * `distDir` yet omits this hook triggers a `DF8106` diagnostic, since the
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
   *   - `workspace` — per-project state (settings, caches). Typically
   *     under `${workspaceRoot}/node_modules/.<appName>/devframe/`.
   *   - `global`    — per-user state (auth tokens, machine-wide
   *     preferences). Typically under
   *     `${homedir()}/.<appName>/devframe/`.
   *
   * Implementations should ensure the directory exists or be safe to
   * pass to a downstream `createStorage(...)` call that creates it
   * lazily.
   */
  getStorageDir: (scope: 'workspace' | 'global') => string
}
