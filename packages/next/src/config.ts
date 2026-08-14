/**
 * Minimal shape of the bits of `next.config` this helper reads/writes, so the
 * package doesn't pull Next's full config type graph into its `.d.ts` bundle.
 * Any real `NextConfig` structurally satisfies it.
 */
export interface DevframeNextConfig {
  skipTrailingSlashRedirect?: boolean
  [key: string]: unknown
}

/**
 * Apply the Next config settings a devframe **host** requires, preserving
 * everything else.
 *
 * Sets `skipTrailingSlashRedirect: true`: mounted devframe SPAs are served at
 * `/__<id>/` and reference their assets relatively (`./_next/…`). Next's
 * default trailing-slash redirect (`/__git/` → `/__git`) would re-root those
 * relative paths and 404 every asset, leaving the panel unstyled and unable to
 * connect. Serving the base path verbatim keeps relative resolution intact.
 *
 * ```js [next.config.mjs]
 * import { withDevframe } from '@devframes/next/dev-spa'
 *
 * export default withDevframe({
 *   // ...your own Next config
 * })
 * ```
 */
export function withDevframe<T extends DevframeNextConfig>(
  nextConfig: T = {} as T,
): T {
  return {
    ...nextConfig,
    skipTrailingSlashRedirect: nextConfig.skipTrailingSlashRedirect ?? true,
  }
}
