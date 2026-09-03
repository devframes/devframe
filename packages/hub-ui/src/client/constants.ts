import type { DevframeViewBuiltin } from '@devframes/hub'

/**
 * `window` event the "Hide" command dispatches to conceal the embedded dock.
 * The embedded bootstrap's visibility controller catches it and detaches the
 * dock; the `Shift+Alt+D` reveal shortcut (or, in `passive` mode, a later
 * reload) brings it back (see `src/client/embedded/visibility.ts`).
 */
export const HUB_UI_HIDE_EVENT = 'devframes:hub-ui:hide'

/**
 * Dock id of the Devframe Inspector (mounted from `@devframes/plugin-inspect`).
 * The client gates the dock behind the `showDevframeInspector` user setting.
 * Mirrors the plugin's `PLUGIN_ID`.
 */
export const INSPECTOR_DOCK_ID = 'devframes_plugin_inspect'

/**
 * Dock id of the Terminals feed (from `@devframes/plugin-terminals`).
 * A launcher tracking a terminal session targets this dock via
 * `hub:docks:activate({ dockId, params: { sessionId } })` to jump the user
 * straight to that session's output. Mirrors the plugin's `PLUGIN_ID`.
 */
export const TERMINALS_DOCK_ID = 'devframes_plugin_terminals'

/**
 * Dock id of the Messages feed (from `@devframes/plugin-messages`).
 * Clicking a toast focuses the entry in that panel. Mirrors the plugin's
 * `PLUGIN_ID`.
 */
export const MESSAGES_DOCK_ID = 'devframes_plugin_messages'

export const BUILTIN_ENTRY_CLIENT_AUTH_NOTICE: DevframeViewBuiltin = Object.freeze({
  type: '~builtin',
  category: '~builtin',
  id: '~client-auth-notice',
  title: 'Unauthorized',
  icon: 'ph:warning-duotone',
})

/**
 * The hub UI provider's own Settings view. hub-ui owns this `~builtin` dock rather than
 * leaning on a host to register it server-side, so the Settings tab is visible
 * by default in every consumer of the reference UI (the standalone viewer and
 * the embedded dock alike). A `~builtin` view defaults its category to
 * `~builtin`, so it groups and sorts last on the bar. A host that registers its
 * own `~settings` dock (node-side, into `devframe:docks`) still wins the merge;
 * this entry only fills the gap when none is present.
 */
export const BUILTIN_ENTRY_SETTINGS: DevframeViewBuiltin = Object.freeze({
  type: '~builtin',
  category: '~builtin',
  id: '~settings',
  title: 'Settings',
  icon: 'ph:gear-duotone',
})

export const BUILTIN_ENTRIES: readonly DevframeViewBuiltin[] = Object.freeze([
  BUILTIN_ENTRY_CLIENT_AUTH_NOTICE,
  BUILTIN_ENTRY_SETTINGS,
])

export { DEFAULT_CATEGORIES_ORDER } from '@devframes/hub/constants'
