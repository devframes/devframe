import type { DevframeViewLauncher } from '@devframes/hub/types'
// Applies src/types.ts, which owns the published `createUi()` config types and
// registers hub-ui's own settings fields on `DevframeDocksUserSettings`.
import '../types'
// Registers the json-render `'json-render'` dock entry on the hub's open dock
// union via declaration merging. Must be a value import (TS rejects a type-only
// side-effect import), but is fully erased since nothing in dist references it.
import '@devframes/json-render/hub'

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
