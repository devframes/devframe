import type { DevframeViewBuiltin } from '@devframes/hub'

/**
 * `window` event the "Hide" command dispatches to ask whoever mounted the
 * embedded dock to tear it down for the session. The hub-ui dock is always
 * visible by design — hiding is a page-lifetime action, and a reload brings
 * the dock back (see `src/client/embedded/index.ts`).
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

export const BUILTIN_ENTRIES: readonly DevframeViewBuiltin[] = Object.freeze([
  BUILTIN_ENTRY_CLIENT_AUTH_NOTICE,
])

export { DEFAULT_CATEGORIES_ORDER } from '@devframes/hub/constants'
