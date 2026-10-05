import type { DevframeHubUi } from '@devframes/hub/initiate'
import type { HubUiLocale } from './locales'
import type { DevframeBranding, DevframeDockPreferences, EmbeddedVisibility } from './types'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuthBanner } from 'devframe/recipes/interactive-auth'

export { HUB_UI_LOCALES, type HubUiLocale } from './locales'
export type { ColorSchemeValue, DevframeBranding, DevframeDockPreferences, EmbeddedVisibility, ViewerBackground } from './types'

declare module 'devframe/types' {
  interface DevframeConnectionConfigsRegistry {
    ui: {
      branding?: DevframeBranding
      embeddedVisibility?: EmbeddedVisibility
      dockPreferences?: DevframeDockPreferences
      /**
       * The hub UI language. `createUi({ locale })` publishes the host's
       * default; the running hub UI then overwrites it with the language it
       * resolved (the visitor's own pick, else this default, else the
       * browser's), so a mounted frame reads the effective one.
       */
      locale?: HubUiLocale
    }
  }
}

/**
 * The built client assets live next to the built entry (`dist/index.mjs` →
 * `dist/client/`). When this module runs from source instead (tests and
 * playgrounds resolving the workspace alias), fall back to the package's
 * `dist/client/`; the assets are build artifacts either way.
 */
function clientDir(): string {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const sibling = join(here, 'client')
  // Probe for the built bootstrap, not the directory: running from source,
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
   * Rebrand the reference UI: logo, product name, primary color, and more.
   * Published as `ConnectionMeta.configs.ui.branding`, read by the dock at
   * boot from the one connection handshake it already performs. Reaches
   * both the embedded dock and the standalone viewer.
   */
  branding?: DevframeBranding
  /**
   * How the embedded floating dock reveals itself on a fresh page:
   *
   * - `'normal'` (default): shown immediately.
   * - `'passive'`: starts hidden with a console hint; `Shift+Alt+D` reveals
   *   it, and the reveal persists per-origin so later sessions start shown.
   * - `'hidden'`: starts hidden; `Shift+Alt+D` reveals it for the current
   *   session only.
   *
   * Published as `ConnectionMeta.configs.ui.embeddedVisibility`. Like the
   * float/edge dock mode, it seeds a user-overridable preference; the
   * visitor's own reveal/hide wins from then on. Applies to the embedded
   * dock only; the standalone viewer is an explicit visit and always shows.
   */
  embeddedVisibility?: EmbeddedVisibility
  /**
   * Dock-bar rendering preferences: category ordering, floating-dock
   * inline-item capacity, and the first-run float/edge mode and position.
   * Published as `ConnectionMeta.configs.ui.dockPreferences`; each seeds a
   * user-overridable preference the visitor's own choice then wins.
   */
  dockPreferences?: DevframeDockPreferences
  /**
   * Default UI language, one of {@link HUB_UI_LOCALES}. Published as
   * `ConnectionMeta.configs.ui.locale` and, like the dock mode, only a
   * seed: a visitor's own pick in Settings → Appearance wins. Without it
   * the UI follows the browser language, falling back to English.
   */
  locale?: HubUiLocale
}

/**
 * The reference implementation of the hub's {@link DevframeHubUi} slot,
 * prebuilt from this package's web components (the floating `DockEmbedded`
 * bootstrap and the standalone `DockStandalone` SPA), styled with the
 * shared devframe design system.
 *
 * ```ts
 * import { initHub } from '@devframes/hub/initiate'
 * import { createUi } from '@devframes/hub-ui'
 *
 * const hub = initHub({ devframes: [git, terminals], ui: createUi() })
 * ```
 *
 * The hub stays headless either way; this object is one implementation of
 * the slot; a hub UI provider (a product's or your own) supplies a different one to the
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
    /**
     * Publish the reference UI's config through the generic `ctx.staticConfig`,
     * which rides the connection handshake to every mounted frame and the
     * standalone viewer as `ConnectionMeta.configs.ui`.
     */
    setup(ctx) {
      ctx.staticConfig.ui = {
        branding: options.branding || {},
        ...(options.embeddedVisibility ? { embeddedVisibility: options.embeddedVisibility } : {}),
        ...(options.dockPreferences ? { dockPreferences: options.dockPreferences } : {}),
        ...(options.locale ? { locale: options.locale } : {}),
      }
    },
    /**
     * Node-side counterpart to the browser rebrand above: the same
     * `productName` titles the interactive-auth box printed to the terminal,
     * so a rebranded hub doesn't print a stray "Devframe" code prompt.
     */
    authBanner: createAuthBanner({
      title: options.branding?.productName,
    }),
  }
}
