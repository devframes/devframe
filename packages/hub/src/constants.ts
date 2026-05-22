import type { DevframeDockEntryCategory } from './types/docks'
import type { DevframeDocksUserSettings } from './types/settings'

export * from 'devframe/constants'

export const DEFAULT_CATEGORIES_ORDER: Record<string, number> = {
  '~viteplus': -1000,
  'default': 0,
  'app': 100,
  'framework': 200,
  'web': 300,
  'advanced': 400,
  '~builtin': 1000,
} satisfies Record<DevframeDockEntryCategory, number>

export const DEFAULT_STATE_USER_SETTINGS: () => DevframeDocksUserSettings = () => ({
  docksHidden: [],
  docksCategoriesHidden: [],
  docksPinned: [],
  docksCustomOrder: {},
  showIframeAddressBar: false,
  closeOnOutsideClick: false,
  commandShortcuts: {},
})
