import type { DevframeCommandShortcutOverrides } from './commands'

export interface DevframeDocksUserSettings {
  docksHidden: string[]
  docksCategoriesHidden: string[]
  docksPinned: string[]
  docksCustomOrder: Record<string, number>
  showIframeAddressBar: boolean
  closeOnOutsideClick: boolean
  commandShortcuts: DevframeCommandShortcutOverrides
  /**
   * Auto-collapse the edge-mode toolbar to a small handle when idle (no
   * hover or drag) and the panel content is closed, instead of permanently
   * spanning the full edge. Off by default — an absent value preserves
   * today's edge-mode behavior for existing users; opt in from
   * Settings → Appearance.
   */
  autoCollapseEdgeToolbar?: boolean
}
