import type { DevframeCommandShortcutOverrides } from './commands'

/**
 * Persisted per-user dock + command settings, synced over the
 * `devframe:user-settings` shared state. The generic base carries the hub's
 * own dock-registry and command model that every viewer shares; a viewer
 * augments it with its own reference-UI toggles via declaration merging:
 *
 * ```ts
 * declare module '@devframes/hub/types' {
 *   interface DevframeDocksUserSettings {
 *     myViewerToggle?: boolean
 *   }
 * }
 * ```
 *
 * Augmented fields are optional so the hub's `DEFAULT_STATE_USER_SETTINGS()`
 * (which knows nothing about them) stays assignable - an absent value reads
 * as the viewer's documented default.
 */
export interface DevframeDocksUserSettings {
  /** Ids of dock entries the user has hidden from the bar. */
  docksHidden: string[]
  /** Category ids the user has collapsed/hidden on the bar. */
  docksCategoriesHidden: string[]
  /** Ids of dock entries the user has pinned. */
  docksPinned: string[]
  /** Per-entry sort weight overriding the registry's default order. */
  docksCustomOrder: Record<string, number>
  /** Per-command keybinding overrides (empty array = shortcut disabled). */
  commandShortcuts: DevframeCommandShortcutOverrides
}
