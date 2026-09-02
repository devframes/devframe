import type { DevframeViewLauncher } from '@devframes/hub/types'
// Registers the json-render `'json-render'` dock entry on the hub's open dock
// union via declaration merging. Must be a value import (TS rejects a type-only
// side-effect import), but is fully erased since nothing in dist references it.
import '@devframes/json-render/hub'

/**
 * hub-ui's own reference-UI settings, merged onto the hub's generic
 * {@link DevframeDocksUserSettings} - the hub core stays unaware of them.
 * Every field is optional so the hub's `DEFAULT_STATE_USER_SETTINGS()` (which
 * knows nothing about them) stays assignable; what an absent value means lives
 * in one place, `HUB_UI_SETTINGS_DEFAULTS` (`state/settings-defaults.ts`),
 * merged in once by `useSettings()` so readers see resolved values rather than
 * repeating a per-call-site fallback.
 */
declare module '@devframes/hub/types' {
  interface DevframeDocksUserSettings {
    /** Show the address-bar chrome on iframe dock views. */
    showIframeAddressBar?: boolean
    /** Close the floating dock panel when clicking outside it. */
    closeOnOutsideClick?: boolean
    /**
     * Auto-collapse the edge-mode toolbar to a small handle when idle (no
     * hover or drag) and the panel content is closed, instead of permanently
     * spanning the full edge.
     */
    autoCollapseEdgeToolbar?: boolean
    /**
     * Reveal the Devframe Inspector dock (the "devtools for the devtools"
     * meta-introspection panel) on the dock bar. Users opt in from
     * Settings → Advanced.
     */
    showDevframeInspector?: boolean
  }
}

/**
 * A selectable launch root offered by a launcher dock entry.
 *
 * When a launcher supplies {@link HubViewLauncher.launcher.roots}, the hub UI provider
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
     * present the hub UI provider renders a picker; the chosen root's `value` is
     * forwarded to the bound launch command as a `{ root }` payload.
     */
    roots?: DevframeLaunchRoot[]
  }
}
