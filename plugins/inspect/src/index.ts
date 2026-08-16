import type { DevframeDefinition, RemoteAssets } from 'devframe'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }
import { setupInspect } from './node/index'

/** Default devframe id — drives the hosted mount path `/__<id>/`. */
const DEFAULT_ID = 'devframes_plugin_inspect'

// The Vue SPA ships in the lockstep-versioned `@devframes/plugin-inspect-assets`
// package rather than inside this (slim) node package. `resolveFrom` lets a
// locally installed copy (a workspace link in this monorepo, or an explicit
// `npm install` for air-gapped setups) be served with zero network; otherwise
// the assets stream on demand through devframe's caching CDN back-proxy.
const distDir: RemoteAssets = {
  package: `${pkg.name}-assets`,
  version: pkg.version,
  resolveFrom: import.meta.url,
}

export interface InspectDevframeOptions {
  /** Override the devframe id (and default CLI command / mount path). */
  id?: string
  /** Override the display name shown in a host dock. */
  name?: string
  /** Override the dock icon. */
  icon?: string
  /**
   * Override the mount path. Left unset, the SPA mounts at `/` standalone
   * and `/__<id>/` when hosted (Vite/embedded).
   */
  basePath?: string
  /** Preferred standalone CLI port. */
  port?: number
  /**
   * Require the trust handshake on the standalone server. Enabled by
   * default — `--open` embeds the current OTP in the opened URL, so the
   * tab authenticates automatically without extra prompts. Hosted adapters
   * manage their own auth and ignore this.
   */
  auth?: boolean
}

/**
 * Build a {@link DevframeDefinition} for the Devframe Inspector. The
 * same definition runs standalone (`/cli`, `/build`) and mounts
 * into a host (`/vite`, hub).
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createInspectDevframe(options: InspectDevframeOptions = {}): DevframeDefinition {
  const id = options.id ?? DEFAULT_ID
  return defineDevframe({
    id,
    name: options.name ?? 'Devframe Inspector',
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: options.icon ?? 'ph:stethoscope-duotone',
    basePath: options.basePath,
    cli: {
      command: id,
      port: options.port ?? 9012,
      distDir,
      // Gate the standalone server by default; `maybeOpenBrowser` folds the
      // current OTP into the `--open` URL so the tab lands already trusted.
      // Hosted adapters (Vite/hub) supply their own auth layer and ignore this.
      auth: options.auth ?? true,
    },
    dock: {
      category: '~builtin',
    },
    setup(ctx) {
      setupInspect(ctx)
    },
  })
}

/** The default inspector devframe definition. */
const inspectDevframe: DevframeDefinition = createInspectDevframe()

export default inspectDevframe
export type { InvokeResult, RpcFunctionInfo } from './types'
