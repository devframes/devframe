import type { DevframeDocksUserSettings } from './types/settings'

export * from 'devframe/constants'

/**
 * The default ordering weight for each known dock category — lower sorts
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

export const DEFAULT_STATE_USER_SETTINGS: () => DevframeDocksUserSettings = () => ({
  docksHidden: [],
  docksCategoriesHidden: [],
  docksPinned: [],
  docksCustomOrder: {},
  showIframeAddressBar: false,
  closeOnOutsideClick: false,
  commandShortcuts: {},
})
