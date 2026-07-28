import type { DevframeNodeContext, RpcStreamingChannel } from 'devframe/types'
import { resolveAssetPath } from './paths'

export interface AssetsConfig {
  /** Directory this devframe manages. */
  dir: string
  /** Whether upload / rename / delete / mkdir are registered. */
  write: boolean
  /** Extensions `upload` accepts, or `'*'` to accept any. */
  uploadExtensions: readonly string[] | '*'
  /**
   * URL base the managed directory is served at. Normally the host
   * (Vite / Nuxt / …) serves `public/` at `/`, so asset `publicPath`s are
   * `joinURL(baseURL, path)` and the plugin serves nothing itself.
   */
  baseURL: string
  /** The upload streaming channel, created once in `setupAssets` when `write` is enabled. */
  uploadChannel?: RpcStreamingChannel<Uint8Array>
}

export interface AssetsContext extends AssetsConfig {
  /** Resolve a root-relative path to an absolute one, rejecting escapes. */
  resolvePath: (relativePath: string) => string
}

const configs = new WeakMap<DevframeNodeContext, AssetsConfig>()
const contexts = new WeakMap<DevframeNodeContext, AssetsContext>()

/**
 * Record the managed directory and write policy for a context. Called from
 * the devframe's `setup` before any RPC handler runs.
 */
export function configureAssets(ctx: DevframeNodeContext, config: AssetsConfig): void {
  configs.set(ctx, config)
  contexts.delete(ctx)
}

/**
 * Per-`DevframeNodeContext` assets state. Each RPC function pulls its
 * managed directory and path resolver from here instead of re-reading
 * `configureAssets`'s config on every call.
 */
export function getAssetsContext(ctx: DevframeNodeContext): AssetsContext {
  const existing = contexts.get(ctx)
  if (existing)
    return existing

  const config = configs.get(ctx)
  const dir = config?.dir ?? ctx.cwd
  const built: AssetsContext = {
    dir,
    write: config?.write ?? true,
    uploadExtensions: config?.uploadExtensions ?? '*',
    baseURL: config?.baseURL ?? '/',
    uploadChannel: config?.uploadChannel,
    resolvePath: (relativePath: string) => resolveAssetPath(dir, relativePath),
  }
  contexts.set(ctx, built)
  return built
}
