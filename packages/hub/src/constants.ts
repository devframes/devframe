import type { DevframeDocksUserSettings } from './types/settings'
import { cleanDoubleSlashes, withLeadingSlash, withTrailingSlash } from 'ufo'
import { HUB_EVENTS } from './events'

export { HUB_EVENTS } from './events'
export * from 'devframe/constants'

/** Default mount base for a hub instance - one namespace, one catch-all. */
export const DEVFRAMES_HUB_BASE = '/__devframes/'

/**
 * Normalize a hub mount base to an absolute path with leading and trailing
 * slashes (e.g. `devframes` → `/devframes/`), collapsing any doubled
 * slashes the input introduced. The one implementation every hub-aware
 * host (`@devframes/hub` itself, and the Vite/Nuxt/Next adapters) resolves
 * `options.base` through.
 */
export function normalizeHubBase(base: string): string {
  return cleanDoubleSlashes(withTrailingSlash(withLeadingSlash(base)))
}

/**
 * The default ordering weight for each known dock category - lower sorts
 * earlier. Downstream viewers (e.g. `@vitejs/devtools-kit`) import this as the
 * single source of truth so the hub and its viewers agree on category order.
 * `framework` sorts first; `~builtin` (the viewer's own built-in views) last.
 *
 * The buckets read from "closest to your app" → "platform / analysis" →
 * "peripheral". Gaps between the weights are intentional: a kit can interleave
 * its own categories (or override these) without editing this table.
 */
export const DEFAULT_CATEGORIES_ORDER: Record<string, number> = {
  'framework': -100,
  'default': 0,
  'app': 100,
  'ui': 150,
  'data': 250,
  'web': 300,
  'performance': 350,
  'advanced': 400,
  'docs': 500,
  '~builtin': 1000,
}

/**
 * Shared-state slot carrying the hub's renderer manifest - one
 * {@link import('./client/renderers').DockRendererManifest} entry per dock
 * `type`, published by `initHub({ renderers })` and consumed by every
 * hub-aware client (the headless client host and viewers alike).
 */
export const DOCK_RENDERERS_STATE_KEY: string = HUB_EVENTS.sharedState.dockRenderers

export const DEFAULT_STATE_USER_SETTINGS: () => DevframeDocksUserSettings = () => ({
  docksHidden: [],
  docksCategoriesHidden: [],
  docksPinned: [],
  docksCustomOrder: {},
  commandShortcuts: {},
})
