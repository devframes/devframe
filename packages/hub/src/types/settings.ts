import type { DevframeCommandShortcutOverrides } from './commands'

export interface DevframeDocksUserSettings {
  docksHidden: string[]
  docksCategoriesHidden: string[]
  docksPinned: string[]
  docksCustomOrder: Record<string, number>
  showIframeAddressBar: boolean
  closeOnOutsideClick: boolean
  commandShortcuts: DevframeCommandShortcutOverrides
}
