import type { ViteDevframeHubOptions } from '@devframes/vite/hub'
import { DEVFRAMES_HUB_BASE, normalizeHubBase } from '@devframes/hub/constants'
import { viteDevframeHub } from '@devframes/vite/hub'
import { addVitePlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface DevframeNuxtHubOptions extends Omit<ViteDevframeHubOptions, 'quiet'> {
  /**
   * Inject `@devframes/hub-ui`'s floating-dock bootstrap (`<base>embedded.js`)
   * into the app head in dev. Disable if you render your own UI or pass
   * `ui: false`. Default: `true` (unless `ui` is `false`).
   */
  injectEmbedded?: boolean
  /**
   * Silence the notice recommending Nuxt DevTools. See the module docs.
   *
   * @default false
   */
  quiet?: boolean
}

export type ModuleOptions = DevframeNuxtHubOptions

let recommendedNuxtDevtools = false

function recommendNuxtDevtools(): void {
  if (recommendedNuxtDevtools)
    return
  recommendedNuxtDevtools = true
  console.warn(
    '[@devframes/nuxt/hub] Serving a devframes-hub directly inside Nuxt works, '
    + 'but Nuxt DevTools (`@nuxt/devtools`) integrates the hub protocol natively '
    + '- prefer it for a first-class, multi-integration experience. '
    + 'Pass `{ quiet: true }` to silence this notice.',
  )
}

/**
 * Nuxt module that mounts a whole **devframes-hub** alongside `nuxt dev` -
 * many integrations under one namespace, one merged RPC registry - by wiring
 * `@devframes/vite`'s hub plugin into Nuxt's underlying Vite dev server and
 * injecting `@devframes/hub-ui`'s floating dock into the app. The UI defaults
 * to `@devframes/hub-ui`; pass `ui` to swap it or `ui: false` for a headless
 * hub you drive with `@devframes/nuxt/hub/client`.
 *
 * This mounts one integration-agnostic hub. Nuxt DevTools (`@nuxt/devtools`)
 * integrates the same hub protocol natively and is the recommended path for a
 * Nuxt app, so this module emits a one-time notice to that effect (silence it
 * with `{ quiet: true }`). To wire a Nuxt app up as a single devframe client,
 * reach for `@devframes/nuxt/single` instead.
 *
 * ```ts [nuxt.config.ts]
 * export default defineNuxtConfig({
 *   modules: [['@devframes/nuxt/hub', { devframes: [] }]],
 * })
 * ```
 */
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@devframes/nuxt/hub',
    configKey: 'devframeHub',
  },
  defaults: {},
  setup(options, nuxt) {
    if (!options.quiet)
      recommendNuxtDevtools()

    // The hub is a dev-time surface; skip it entirely for production builds.
    if (!nuxt.options.dev)
      return

    createResolver(import.meta.url)

    const base = normalizeHubBase(options.base ?? DEVFRAMES_HUB_BASE)
    const { injectEmbedded, quiet: _quiet, ...hubOptions } = options

    // Wire the hub into Nuxt's own Vite dev server. `quiet: true` suppresses
    // the vite plugin's Vite-DevTools notice - this module already emits the
    // Nuxt-DevTools one above.
    addVitePlugin(viteDevframeHub({ ...hubOptions, base, quiet: true }))

    // Inject the floating-dock bootstrap into the app head (dev only) unless
    // the caller opts out or renders their own UI.
    const wantEmbedded = injectEmbedded ?? options.ui !== false
    if (wantEmbedded) {
      nuxt.options.app ??= {} as typeof nuxt.options.app
      nuxt.options.app.head ??= {}
      nuxt.options.app.head.script ??= []
      nuxt.options.app.head.script.push({
        type: 'module',
        src: `${base}embedded.js`,
      })
    }
  },
})
