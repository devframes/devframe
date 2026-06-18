import type { DevframeDefinition } from 'devframe/types'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { setupInspect } from './node/index'

/** Default devframe id — drives the hosted mount path `/__<id>/`. */
const DEFAULT_ID = 'devframes-plugin-inspect'

// The Vue SPA is built (by Vite) into `dist/spa`. From both the source
// entry (`src/index.ts`, via the workspace alias) and the published
// entry (`dist/index.mjs`), `../dist/spa` resolves to `<pkg>/dist/spa`.
const distDir = fileURLToPath(new URL('../dist/spa', import.meta.url))

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
   * Require the trust handshake on the standalone server. Defaults to
   * `false` (auto-trust) since the inspector is a single-user localhost
   * tool. Hosted adapters manage their own auth.
   */
  auth?: boolean
}

/**
 * Build a {@link DevframeDefinition} for the RPC & State inspector. The
 * same definition runs standalone (`/cli`, `/spa`, `/build`) and mounts
 * into a host (`/vite`, hub).
 */
export function createInspectDevframe(options: InspectDevframeOptions = {}): DevframeDefinition {
  const id = options.id ?? DEFAULT_ID
  return defineDevframe({
    id,
    name: options.name ?? 'RPC & State Inspector',
    icon: options.icon ?? 'ph:stethoscope-duotone',
    basePath: options.basePath,
    cli: {
      command: id,
      port: options.port ?? 9012,
      distDir,
      // A single-user localhost inspector: skip the trust handshake so
      // the SPA's shared-state subscription initializes without a manual
      // auth round-trip. Hosted adapters (Vite/hub) supply their own
      // auth layer and ignore this.
      auth: options.auth ?? false,
    },
    spa: { loader: 'none' },
    setup(ctx) {
      setupInspect(ctx)
    },
  })
}

/** The default inspector devframe definition. */
const inspectDevframe: DevframeDefinition = createInspectDevframe()

export default inspectDevframe
export type { InvokeResult, RpcFunctionInfo } from './types'
