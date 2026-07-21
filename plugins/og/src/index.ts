import type { DevframeDefinition } from 'devframe/types'
import type { OgFetch } from './types'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import pkg from '../package.json' with { type: 'json' }
import { setupOg } from './node/index'

const DEFAULT_ID = 'devframes_plugin_og'
const distDir = fileURLToPath(new URL('../dist/spa', import.meta.url))

export interface OgDevframeOptions {
  id?: string
  name?: string
  icon?: string
  basePath?: string
  port?: number
  /** Require the trust handshake. Enabled by default for the network-capable backend. */
  auth?: boolean
  /** URL inspected when the UI does not supply one and baked by `build`. */
  defaultUrl?: string
  /** Override the request implementation, primarily for custom transports and tests. */
  fetch?: OgFetch
}

/**
 * Create the standalone Open Graph viewer definition.
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createOgDevframe(options: OgDevframeOptions = {}): DevframeDefinition {
  const id = options.id ?? DEFAULT_ID
  return defineDevframe({
    id,
    name: options.name ?? 'Open Graph',
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: options.icon ?? 'ph:image-square-duotone',
    basePath: options.basePath,
    cli: {
      command: id,
      port: options.port ?? 9016,
      distDir: existsSync(distDir) ? distDir : undefined,
      auth: options.auth ?? true,
    },
    spa: { loader: 'query' },
    dock: { category: '~builtin' },
    setup(ctx) {
      setupOg(ctx, { defaultUrl: options.defaultUrl, fetch: options.fetch })
    },
  })
}

const ogDevframe: DevframeDefinition = createOgDevframe()

export default ogDevframe
export type { OgFetch, OgHeadTag, OgHeadTagName, OgResolveInput, OgSnapshot } from './types'
