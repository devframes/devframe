import type { DevframeHubUi } from '@devframes/hub/initiate'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The built client assets live next to the built entry (`dist/index.mjs` →
 * `dist/client/`). When this module runs from source instead (tests and
 * playgrounds resolving the workspace alias), fall back to the package's
 * `dist/client/` — the assets are build artifacts either way.
 */
function clientDir(): string {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const sibling = join(here, 'client')
  // Probe for the built bootstrap, not the directory — running from source,
  // `src/client/` exists too but holds sources, not servable artifacts.
  if (existsSync(join(sibling, 'embedded.js')))
    return sibling
  return join(here, '../dist/client')
}

export interface CreateUiOptions {
  /** Serve the standalone viewer SPA at the hub base. Default: `true`. */
  viewer?: boolean
  /** Serve the floating-dock bootstrap at `<base>embedded.js`. Default: `true`. */
  embedded?: boolean
}

/**
 * The reference implementation of the hub's {@link DevframeHubUi} slot —
 * prebuilt from this package's web components (the floating `DockEmbedded`
 * bootstrap and the standalone `DockStandalone` viewer), styled with the
 * shared devframe design system.
 *
 * ```ts
 * import { initHub } from '@devframes/hub/initiate'
 * import { createUi } from '@devframes/hub-ui'
 *
 * const hub = initHub({ devframes: [git, terminals], ui: createUi() })
 * ```
 *
 * The hub stays headless either way — this object is one implementation of
 * the slot; a viewer product (or your own) supplies a different one to the
 * same option and reuses all the infrastructure.
 */
export function createUi(options: CreateUiOptions = {}): DevframeHubUi {
  const client = clientDir()
  return {
    ...(options.viewer !== false
      ? { viewer: { distDir: join(client, 'standalone') } }
      : {}),
    ...(options.embedded !== false
      ? { embedded: { entry: join(client, 'embedded.js') } }
      : {}),
  }
}
