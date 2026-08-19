import type { StaticAssetsSource } from './remote-assets'

export interface DevframeViewHost {
  /**
   * @internal
   */
  buildStaticDirs: { baseUrl: string, source: StaticAssetsSource }[]
  /**
   * Helper to host static files
   * - In `dev` mode, it will register middleware to `viteServer.middlewares` to host the static files
   * - In `build` mode, it will copy the static files to the dist directory
   *
   * Accepts a local dist directory, or a {@link StaticAssetsSource} remote
   * declaration served through devframe's caching CDN back-proxy.
   *
   * `defaultResolveFrom` overrides, for this call only, the context's own
   * `importMetaUrl` as the default `resolveFrom` for a remote source that
   * doesn't set one. A shared host that mounts assets on behalf of another
   * devframe (a hub installing a plugin) passes that plugin's `importMetaUrl`
   * so the assets resolve against the plugin's dependency graph rather than
   * the host's.
   */
  hostStatic: (baseUrl: string, source: StaticAssetsSource, defaultResolveFrom?: string | null) => void
}
