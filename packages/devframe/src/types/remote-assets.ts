/**
 * A version-locked pointer at browser assets published as their own npm
 * package (e.g. `@devframes/plugin-git-client`), served through devframe's
 * caching back-proxy instead of a directory shipped inside the node package.
 *
 * Resolution order at serve time:
 *
 *   1. The package installed locally (resolved from {@link resolveFrom})
 *      - the zero-network / air-gap path. Version skew warns; a major
 *      version mismatch throws.
 *   2. The per-file cache under
 *      `<storageDir project>/.remote-assets/<package>@<version>/`.
 *   3. The CDN {@link provider} - each requested file streams through to
 *      the browser while being written into the cache.
 *
 * Anywhere a static mount accepts a dist directory (`clientAssets`,
 * `hostStatic`, `mountStatic`) it also accepts this object - see
 * {@link StaticAssetsSource}.
 */
export interface RemoteAssets {
  /** npm package name that ships the assets, e.g. `@devframes/plugin-git-client`. */
  package: string
  /** Exact version to serve, e.g. `1.2.3`. Typically the host package's own version. */
  version: string
  /**
   * Subpath inside the package the served assets live under.
   *
   * @default 'dist'
   */
  path?: string
  /**
   * CDN that mirrors npm and serves individual package files.
   *
   * @default 'jsdelivr'
   */
  provider?: RemoteAssetsProvider
  /**
   * `import.meta.url` of the declaring module. When set, a locally
   * installed copy of {@link package} is resolved from this module's own
   * dependency graph first (works under pnpm's strict layout) and served
   * with zero network. Omitting it skips the installed-package step -
   * cache + CDN still work.
   */
  resolveFrom?: string | null
  /** Custom fetch implementation (proxies, tests). Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch
  /**
   * Never touch the network: serve only from the locally installed package
   * or files already in the cache.
   *
   * @default false
   */
  offline?: boolean
}

/**
 * Built-in CDN providers (`'jsdelivr'` - default, `'unpkg'`) or a custom
 * provider for corp mirrors.
 */
export type RemoteAssetsProvider = 'jsdelivr' | 'unpkg' | RemoteAssetsProviderCustom

/** A custom {@link RemoteAssets} CDN provider (e.g. an internal npm mirror). */
export interface RemoteAssetsProviderCustom {
  /**
   * Absolute URL serving `filePath` (package-relative, POSIX, no leading
   * slash) of `pkg@version`.
   */
  fileUrl: (pkg: string, version: string, filePath: string) => string
  /**
   * List every file path in `pkg@version` (package-relative, no leading
   * slash). Powers request-path resolution (correct 404s / SPA fallback)
   * and build-time materialization. When omitted, requests are resolved by
   * probing {@link fileUrl} directly and builds cannot materialize from
   * this provider.
   */
  listFiles?: (pkg: string, version: string, fetchImpl: typeof globalThis.fetch) => Promise<string[]>
}

/**
 * What every static-assets seam accepts: a local dist directory, or a
 * {@link RemoteAssets} pointer served through the caching back-proxy.
 */
export type StaticAssetsSource = string | RemoteAssets

/**
 * What the remote-assets fallback page posts to `window.parent` when a
 * devframe's client assets could be served from neither a local install nor
 * their provider. A viewer embedding the devframe in an iframe listens for
 * `DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE` (`devframe/constants`) and can
 * render the failure in its own design, with the two ways out the page also
 * spells out: install `package@version` locally, or restore network access.
 */
export interface RemoteAssetsErrorMessage {
  type: 'devframe:remote-assets-error'
  /** npm package the assets are published as. */
  package: string
  /** Exact version the devframe asked for. */
  version: string
  /** Why the fetch failed, as reported by the provider or the network stack. */
  reason: string
}

/**
 * A resolved, servable handle over a {@link RemoteAssets} declaration -
 * produced by `resolveStaticAssetsSource()` (`devframe/utils/remote-assets`)
 * and consumed by the static-serving engine (`devframe/utils/serve-static`).
 */
export interface RemoteAssetsStore {
  /** The declaration this store serves (with defaults applied). */
  readonly assets: RemoteAssets & { path: string }
  /**
   * Resolve a request path (relative to the mount base, SPA fallback to
   * `index.html`) and return a `Response`: streamed from the cache when
   * present, otherwise through the provider while being written into the
   * cache. `null` on a miss (404); throws on provider/network failure.
   */
  serve: (urlPath: string) => Promise<Response | null>
  /**
   * Download every listed file under `assets.path` into `targetDir`
   * (paths relative to `assets.path`). Requires a provider file listing.
   */
  materialize: (targetDir: string) => Promise<void>
}
