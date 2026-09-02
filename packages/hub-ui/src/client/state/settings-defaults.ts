import type { DevframeDocksUserSettings } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { ComputedRef } from 'vue'
import { computed } from 'vue'
import { sharedStateToRef } from './docks'
// Registers hub-ui's own settings fields onto DevframeDocksUserSettings.
import '../types'

/** The subset of {@link DevframeDocksUserSettings} hub-ui itself contributes. */
export type HubUiSettings = Pick<
  DevframeDocksUserSettings,
  'showIframeAddressBar' | 'closeOnOutsideClick' | 'autoCollapseEdgeToolbar' | 'showDevframeInspector'
>

/**
 * Settings with every hub-ui field filled in: what {@link useSettings} hands
 * readers. The hub-ui fields are non-optional here, so a reader gets a plain
 * `boolean` and never has to decide what `undefined` means.
 */
export type ResolvedDocksUserSettings = DevframeDocksUserSettings & Required<HubUiSettings>

/**
 * The single source of truth for what an absent hub-ui setting means.
 *
 * The hub's `DEFAULT_STATE_USER_SETTINGS()` seeds the settings shared state and
 * knows nothing about hub-ui's own fields, so each one stays optional on the
 * wire: a settings object stored before a field existed simply omits it, and a
 * "reset all settings" drops every field back to absent. Resolution therefore
 * happens on read: {@link useSettings} merges this table under the stored value
 * for every component, and {@link hubUiSetting} reads a single field off the
 * unresolved settings objects the pure `dock-settings.ts` helpers are handed.
 */
const HUB_UI_SETTINGS_DEFAULTS: Required<HubUiSettings> = Object.freeze({
  /** Iframe dock views open with the address-bar chrome shown. */
  showIframeAddressBar: false,
  /** Clicking outside the embedded panel leaves it open. */
  closeOnOutsideClick: false,
  /** The edge-mode toolbar shrinks to a handle when idle and closed. */
  autoCollapseEdgeToolbar: true,
  /** The Devframe Inspector dock stays off the bar until opted into. */
  showDevframeInspector: false,
})

/**
 * Read one hub-ui setting off a settings object that may not be resolved.
 *
 * Components take {@link useSettings} instead; this is for the pure helpers in
 * `dock-settings.ts`, whose `settings` argument is caller-supplied and may
 * legitimately be a bare `DEFAULT_STATE_USER_SETTINGS()` with no hub-ui fields
 * at all (stories, the "what would the default order be?" probe in
 * `SettingsDocks.vue`).
 */
export function hubUiSetting<K extends keyof HubUiSettings>(
  settings: Pick<DevframeDocksUserSettings, K> | undefined,
  key: K,
): Required<HubUiSettings>[K] {
  return settings?.[key] ?? HUB_UI_SETTINGS_DEFAULTS[key]
}

const settingsByContext = new WeakMap<DocksContext, ComputedRef<ResolvedDocksUserSettings>>()

/**
 * The read path for user settings: the stored value with
 * {@link HUB_UI_SETTINGS_DEFAULTS} merged under it, so `settings.value.<field>`
 * is always the effective value.
 *
 * Writes keep going to the `SharedState` itself
 * (`context.docks.settings.mutate(…)`); the resolved object is derived and
 * read-only, so a materialised default is never persisted back and "absent"
 * stays the stored representation of "default".
 *
 * Memoised per context because `sharedStateToRef` subscribes to the store for
 * the lifetime of the process: one shared ref means one subscription and one
 * merge per update, however many components read settings.
 */
export function useSettings(context: DocksContext): ComputedRef<ResolvedDocksUserSettings> {
  let settings = settingsByContext.get(context)
  if (!settings) {
    const stored = sharedStateToRef(context.docks.settings)
    settings = computed(() => ({ ...HUB_UI_SETTINGS_DEFAULTS, ...stored.value }))
    settingsByContext.set(context, settings)
  }
  return settings
}
