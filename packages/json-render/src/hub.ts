import type { DevframeDockEntryBase } from '@devframes/hub/types'
import type { JsonRenderView } from './types'
import type { JsonRenderViewRef } from './view-ref'

/**
 * A `json-render` dock entry. Contributed to the hub's **open** dock union
 * (`DevframeDockEntryRegistry`) by this opt-in integration — the hub itself
 * hard-codes no json-render variant. Carries only the serializable
 * {@link JsonRenderViewRef}; no functions cross the wire.
 */
export interface DevframeJsonRenderDockEntry extends DevframeDockEntryBase {
  type: 'json-render'
  /** Serializable reference the client subscribes through. */
  view: JsonRenderViewRef
}

// Contribute the `json-render` variant to the hub's open dock registry. This
// augmentation only loads when a consumer imports `@devframes/json-render/hub`
// (the hub-mounted path), so a standalone app never pulls a hub type.
declare module '@devframes/hub/types' {
  interface DevframeDockEntryRegistry {
    'json-render': DevframeJsonRenderDockEntry
  }
}

/**
 * Build a `json-render` dock entry from a {@link JsonRenderView} and the dock
 * metadata (id, title, icon, …). Projects the view down to its serializable
 * {@link JsonRenderViewRef} so it survives dock projection into shared state.
 */
export function toJsonRenderDockEntry(
  view: JsonRenderView,
  meta: Omit<DevframeJsonRenderDockEntry, 'type' | 'view'>,
): DevframeJsonRenderDockEntry {
  return { ...meta, type: 'json-render', view: view.ref }
}
