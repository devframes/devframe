import type { DevframeDocksUserSettings } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { ConnectionMeta } from 'devframe/types'
import type { Immutable } from 'devframe/utils/shared-state'
import type { ComputedRef } from 'vue'
import { computed } from 'vue'
import { sharedStateToRef } from './docks'
// Registers hub-ui's own settings fields onto DevframeDocksUserSettings.
import '../types'

/** The subset of {@link DevframeDocksUserSettings} hub-ui itself contributes. */
export type HubUiSettings = Pick<
  DevframeDocksUserSettings,
  'showIframeAddressBar' | 'closeOnOutsideClick' | 'autoCollapseEdgeToolbar' | 'showDevframeInspector' | 'docksRecentLimit' | 'expandGroupSidebar'
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
  /** The float bar keeps the last three docks opened from beyond it. */
  docksRecentLimit: 3,
  /** The group sidebar stays an icon-only rail. */
  expandGroupSidebar: false,
})

/**
 * The user-settings seed a host publishes through
 * `createUi({ settingsDefaults })` → `ConnectionMeta.configs.ui.settingsDefaults`.
 *
 * Every field is optional: a seed names only what the project wants to differ
 * from the built-in defaults, and whatever it leaves out keeps falling back.
 *
 * The three list fields (`docksHidden`, `docksCategoriesHidden`, `docksPinned`)
 * are left out on purpose. The stored list is always present, so a seeded list
 * would only win by overriding the visitor's forever, and a developer could
 * hide an entry the project seeded while never unhiding one. Records
 * (`commandShortcuts`, `docksCustomOrder`) merge per key instead, so a seeded
 * entry and a stored entry coexist and the stored one wins where they collide.
 */
export type DocksUserSettingsDefaults = Omit<
  Partial<DevframeDocksUserSettings>,
  'docksHidden' | 'docksCategoriesHidden' | 'docksPinned'
>

/**
 * Read the host-published settings defaults off the connection meta.
 *
 * `configs` is a one-way, boot-time channel, so this is a plain lookup with no
 * subscription: the value is fixed for the life of the page.
 */
export function resolveSettingsDefaults(configs: ConnectionMeta['configs'] | undefined): DocksUserSettingsDefaults {
  return configs?.ui?.settingsDefaults ?? {}
}

/** Drop `undefined` values so a partial seed never clobbers a lower layer. */
function omitUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>
}

/**
 * The one place the settings layers stack: built-in hub-ui defaults, then the
 * host's published defaults, then whatever the visitor stored. The stored
 * value wins because a choice made in Settings means more than the project's
 * suggestion, and "absent" stays the stored representation of "default" so a
 * materialised value is never written back.
 *
 * `docksCustomOrder` stacks per key rather than as a whole object: the stored
 * side is always `{}` at first, so a flat spread would drop every seeded order
 * the moment the visitor reordered one dock. `commandShortcuts` resolves the
 * same way, per command id, in the commands context: the shortcut settings
 * page needs the visitor's own overrides apart from the seeded default, so
 * this merged view deliberately leaves it out.
 */
export function resolveUserSettings(
  stored: Immutable<DevframeDocksUserSettings>,
  defaults: DocksUserSettingsDefaults = {},
): ResolvedDocksUserSettings {
  return {
    ...HUB_UI_SETTINGS_DEFAULTS,
    ...omitUndefined(defaults),
    ...stored,
    docksCustomOrder: {
      ...defaults.docksCustomOrder,
      ...stored.docksCustomOrder,
    },
  } as ResolvedDocksUserSettings
}

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
  // TS cannot relate the indexed access across a key union that mixes
  // boolean and number fields, so the result is re-asserted.
  return (settings?.[key] ?? HUB_UI_SETTINGS_DEFAULTS[key]) as Required<HubUiSettings>[K]
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
    const defaults = resolveSettingsDefaults(context.rpc.connectionMeta.configs)
    settings = computed(() => resolveUserSettings(stored.value, defaults))
    settingsByContext.set(context, settings)
  }
  return settings
}
