import type { DevframeDefinition } from 'devframe/types'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import pkg from '../package.json' with { type: 'json' }
import { setupA11y } from './node/index.ts'

/** Default devframe id — drives the standalone CLI command and the hosted mount path `/__<id>/`. */
const DEFAULT_ID = 'devframe-a11y-inspector'
const BASE_PATH = '/__devframe-a11y-inspector/'

// The Solid panel SPA is built (by Vite) into `dist/spa`. From both the
// source entry (`src/index.ts`, via the workspace alias) and the published
// entry (`dist/index.mjs`), `../dist/spa` resolves to `<pkg>/dist/spa`.
const distDir = fileURLToPath(new URL('../dist/spa', import.meta.url))

/**
 * Absolute path to the built in-page **agent** module (`dist/inject/inject.js`)
 * — the dock **client script** the hub runtime imports into the host page to
 * scan it (its default export boots the agent; importing it does too).
 *
 * A hub attaches this as the a11y dock's `clientScript`, resolved to a URL the
 * page can import: `/@fs/${a11yAgentBundlePath}` for a Vite host, or a
 * statically-served path for others (see the minimal hub examples). Resolves
 * under `<pkg>/dist/inject/inject.js` from both the source and the published
 * entry. Requires the built bundle (`pnpm -C plugins/a11y build`).
 */
export const a11yAgentBundlePath: string = fileURLToPath(new URL('../dist/inject/inject.js', import.meta.url))

export interface A11yDevframeOptions {
  /** Override the devframe id (and the default CLI command / mount path). */
  id?: string
  /** Override the display name shown in a host dock. */
  name?: string
  /** Override the dock icon. */
  icon?: string
  /**
   * Override the mount path. Defaults to `/__devframe-a11y-inspector/` so the
   * panel iframe shares an origin with the host page it scans.
   */
  basePath?: string
  /** Preferred standalone CLI port. */
  port?: number
}

/**
 * Build a {@link DevframeDefinition} for the a11y inspector. The same
 * definition runs standalone (`/cli`, `/build`) and mounts into a host
 * (`/vite`, hub). The panel talks to the in-page agent over a same-origin
 * BroadcastChannel, so the scan/highlight loop works identically in dev
 * (live WebSocket RPC) and in a baked static build.
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createA11yDevframe(options: A11yDevframeOptions = {}): DevframeDefinition {
  const id = options.id ?? DEFAULT_ID
  return defineDevframe({
    id,
    name: options.name ?? 'A11y Inspector',
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: options.icon ?? 'ph:wheelchair-duotone',
    basePath: options.basePath ?? BASE_PATH,
    cli: {
      command: id,
      port: options.port ?? 9899,
      distDir,
    },
    spa: { loader: 'none' },
    setup(ctx) {
      setupA11y(ctx)
    },
  })
}

/** The default a11y inspector devframe definition. */
const a11yDevframe: DevframeDefinition = createA11yDevframe()

export default a11yDevframe
export type { Impact, ScanReport, Violation, ViolationNode } from './shared/protocol.ts'
