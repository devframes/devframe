import type { DevframeViewLauncher } from '@devframes/hub/types'
// Importing the hub-mounted json-render integration registers its
// `'json-render'` dock entry (a serializable `view` ref, not a live handle)
// on the hub's open dock union via declaration merging. This has to be a
// value import, not `import type`, because TS rejects a type-only
// side-effect import (no bindings to mark as type-only) — but it's still
// fully erased at build time since nothing in dist ever references it, so
// @devframes/json-render staying an *optional* peer below doesn't change
// what ships.
import '@devframes/json-render/hub'

/**
 * hub-ui's own reference-UI settings, merged onto the hub's generic
 * {@link DevframeDocksUserSettings} — the hub core stays unaware of them.
 * Every field is optional so the hub's `DEFAULT_STATE_USER_SETTINGS()` (which
 * knows nothing about them) stays assignable; an absent value reads as the
 * documented default.
 */
declare module '@devframes/hub/types' {
  interface DevframeDocksUserSettings {
    /** Show the address-bar chrome on iframe dock views. Defaults to shown. */
    showIframeAddressBar?: boolean
    /** Close the floating dock panel when clicking outside it. */
    closeOnOutsideClick?: boolean
    /**
     * Auto-collapse the edge-mode toolbar to a small handle when idle (no
     * hover or drag) and the panel content is closed, instead of permanently
     * spanning the full edge. Off by default — an absent value preserves the
     * default edge-mode behavior; opt in from Settings → Appearance.
     */
    autoCollapseEdgeToolbar?: boolean
    /**
     * Reveal the Devframe Inspector dock (the "devtools for the devtools"
     * meta-introspection panel). Hidden by default — an absent value keeps the
     * dock out of the dock bar until the user opts in from Settings → Advanced.
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
