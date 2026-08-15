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
   */
  hostStatic: (baseUrl: string, source: StaticAssetsSource) => void
}
