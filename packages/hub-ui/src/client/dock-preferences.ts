/**
 * The reference UI's dock-bar rendering preferences, set via
 * `createUi({ dockPreferences })` and published as
 * `ConnectionMeta.configs.ui.dockPreferences`. Read by the embedded dock and
 * the standalone viewer at boot.
 *
 * Like the float/edge dock mode, these seed user-overridable state — the
 * config sets the default, the visitor's own choice wins from then on.
 */
export interface DevframeDockPreferences {
  /**
   * The top-level dock-bar **category** ordering — a map of category id →
   * ordering weight (lower sorts earlier), merged beneath
   * `DEFAULT_CATEGORIES_ORDER`.
   */
  categoryOrder?: Record<string, number>
  /**
   * Preferred inline-item capacity for the floating dock bar before entries
   * overflow. Edge mode ignores it — it shows every entry with no cutoff.
   */
  maxVisibleItems?: number
  /** Seeds a first-run visitor's dock mode (float vs edge). */
  defaultMode?: 'float' | 'edge'
  /** Seeds a first-run visitor's dock position. */
  defaultPosition?: 'left' | 'right' | 'top' | 'bottom'
}
