import type { Spec } from '@json-render/core'
import type { JsonRenderViewRef } from './view-ref'

/**
 * A Devframes JSON-render spec **is** an `@json-render/core` `Spec`: a flat
 * `root` key, an `elements` map, and optional initial `state`. This alias is
 * the Devframes-facing name; it does not add or remove fields.
 */
export type DevframeJsonRenderSpec = Spec

/**
 * A single JSON-Pointer patch to a view's `state` model. `path` is an
 * RFC 6901 JSON Pointer relative to the state root (e.g. `/count`,
 * `/user/name`). Structural spec changes replace the whole spec via
 * `update` instead.
 */
export interface JsonRenderStatePatch {
  op: 'add' | 'remove' | 'replace'
  /** JSON Pointer relative to the state root, e.g. `/count`. */
  path: string
  value?: unknown
}

/**
 * A JSON-render view handle, returned by `createJsonRenderView`. Owns a
 * server-side shared state carrying the live spec + state, and exposes the
 * serializable {@link JsonRenderViewRef} that a hub dock (or any client
 * transport) uses to locate it.
 */
export interface JsonRenderView {
  /** Author-supplied stable id, unique within the view's scope. */
  readonly id: string
  /** Human-facing label published in the view index (defaults to `id`). */
  readonly title: string
  /** The serializable reference clients subscribe through. */
  readonly ref: JsonRenderViewRef
  /** Replace the entire spec (a structural change replaces the whole spec). */
  update: (spec: DevframeJsonRenderSpec) => void
  /**
   * Apply JSON-Pointer patches to the view's `state`. Travels as a
   * shared-state patch (not a whole-spec snapshot), so only the changed
   * paths cross the wire.
   */
  patchState: (patches: JsonRenderStatePatch[]) => void
  /** Read the current spec (immutable). */
  value: () => DevframeJsonRenderSpec
  /** Unregister the shared state and its listeners. */
  dispose: () => void
}
