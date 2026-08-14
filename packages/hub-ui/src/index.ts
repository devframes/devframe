import type { DevframeHubUi } from '@devframes/hub/initiate'
import type { DevframeDockPreferences } from './client/dock-preferences'
import type { EmbeddedVisibility } from './client/embedded/visibility'
import type { DevframeBranding } from './client/state/branding'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type { DevframeDockPreferences } from './client/dock-preferences'
export type { EmbeddedVisibility } from './client/embedded/visibility'
export type { DevframeBranding } from './client/state/branding'

declare module 'devframe/types' {
  interface DevframeConnectionConfigsRegistry {
    ui: {
      branding?: DevframeBranding
      embeddedVisibility?: EmbeddedVisibility
      dockPreferences?: DevframeDockPreferences
    }
  }
}

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
  /**
   * Rebrand the reference UI — logo, product name, primary color, and more.
   * Published as `ConnectionMeta.configs.ui.branding`, read by the dock at
   * boot from the one connection handshake it already performs. Reaches
   * both the embedded dock and the standalone viewer.
   */
  branding?: DevframeBranding
  /**
   * How the embedded floating dock reveals itself on a fresh page:
   *
   * - `'normal'` (default) — shown immediately.
   * - `'passive'` — starts hidden with a console hint; `Shift+Alt+D` reveals
   *   it, and the reveal persists per-origin so later sessions start shown.
   * - `'hidden'` — starts hidden; `Shift+Alt+D` reveals it for the current
   *   session only.
   *
   * Published as `ConnectionMeta.configs.ui.embeddedVisibility`. Like the
   * float/edge dock mode, it seeds a user-overridable preference — the
   * visitor's own reveal/hide wins from then on. Applies to the embedded
   * dock only; the standalone viewer is an explicit visit and always shows.
   */
  embeddedVisibility?: EmbeddedVisibility
  /**
   * Dock-bar rendering preferences — category ordering, floating-dock
   * inline-item capacity, and the first-run float/edge mode and position.
   * Published as `ConnectionMeta.configs.ui.dockPreferences`; each seeds a
   * user-overridable preference the visitor's own choice then wins.
   */
  dockPreferences?: DevframeDockPreferences
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
    // Publish the reference UI's config through the generic `ctx.staticConfig`
    // — it rides the connection handshake to every mounted frame and the
    // standalone viewer as `ConnectionMeta.configs.ui`.
    setup(ctx) {
      ctx.staticConfig.ui = {
        branding: options.branding || {},
        ...(options.embeddedVisibility ? { embeddedVisibility: options.embeddedVisibility } : {}),
        ...(options.dockPreferences ? { dockPreferences: options.dockPreferences } : {}),
      }
    },
  }
}
