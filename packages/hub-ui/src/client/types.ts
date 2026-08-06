import type { DevframeDockEntryBase, DevframeDocksUserSettings, DevframeViewLauncher, JsonRenderer } from '@devframes/hub/types'

/**
 * hub-ui user settings — the hub's {@link DevframeDocksUserSettings} widened
 * with the toggles only this viewer ships.
 *
 * The extra fields are optional so the hub's `DEFAULT_STATE_USER_SETTINGS()`
 * (which knows nothing about them) stays assignable; an absent value reads as
 * its documented default.
 */
export interface HubDocksUserSettings extends DevframeDocksUserSettings {
  /**
   * Reveal the Devframe Inspector dock (the "devtools for the devtools"
   * meta-introspection panel). Hidden by default — an absent value keeps the
   * dock out of the dock bar until the user opts in from Settings → Advanced.
   */
  showDevframeInspector?: boolean
}

/**
 * A `json-render` dock entry. `@devframes/hub` ships no json-render variant of
 * its own (json-render is the opt-in `@devframes/json-render` package), so
 * hub-ui contributes this entry to the hub's open dock union.
 *
 * It carries the {@link JsonRenderer} handle from the deprecated
 * `ctx.createJsonRenderer()` on `ui`; the handle's methods are non-enumerable,
 * so only its serializable metadata survives dock projection into shared
 * state, where the client reads `ui._stateKey` to subscribe to the live spec.
 */
export interface DevframeViewJsonRender extends DevframeDockEntryBase {
  type: 'json-render'
  /** The renderer handle created by `ctx.createJsonRenderer()`. */
  ui: JsonRenderer
}

declare module '@devframes/hub/types' {
  interface DevframeDockEntryRegistry {
    'json-render': DevframeViewJsonRender
  }
}

/**
 * A selectable launch root offered by a launcher dock entry.
 *
 * When a launcher supplies {@link HubViewLauncher.launcher.roots}, the viewer
 * renders a picker above the launch button. The selected root's
 * {@link DevframeLaunchRoot.value} is forwarded to the launch as `{ root }`,
 * where a process launcher uses it as the spawned process's `cwd`.
 */
interface DevframeLaunchRoot {
  /** Absolute path forwarded as the spawn `cwd` when this root is selected. */
  value: string
  /** Human-friendly label shown in the picker (e.g. `Workspace root`). */
  label: string
  /** Optional secondary line, e.g. the path itself. */
  description?: string
}

/**
 * hub-ui augmentation of hub's launcher entry: adds optional selectable launch
 * {@link HubViewLauncher.launcher.roots | roots}.
 *
 * Docks belong to `@devframes/hub`; this extends the upstream launcher shape
 * locally until the field lands there. Since `roots` is optional, a plain hub
 * `DevframeViewLauncher` remains assignable to this type.
 */
export interface HubViewLauncher extends DevframeViewLauncher {
  launcher: DevframeViewLauncher['launcher'] & {
    /**
     * Selectable launch roots, owner-populated via `docks.update()`. When
     * present the viewer renders a picker; the chosen root's `value` is
     * forwarded to the bound launch command as a `{ root }` payload.
     */
    roots?: DevframeLaunchRoot[]
  }
}
