import type { DevframeDocksUserSettings } from './types/settings'

export * from 'devframe/constants'

/**
 * The default ordering weight for each known dock category — lower sorts
 * earlier. Downstream viewers (e.g. `@vitejs/devtools-kit`) import this as the
 * single source of truth so the hub and its viewers agree on category order.
 * `framework` sorts first; `~builtin` (the viewer's own built-in views) last.
 */
export const DEFAULT_CATEGORIES_ORDER: Record<string, number> = {
  'framework': -100,
  'default': 0,
  'app': 100,
  'web': 300,
  'advanced': 400,
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
