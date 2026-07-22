/**
 * Well-known shared-state key carrying the **view index**: a map of every
 * live JSON-render view registered on a context, keyed by its `stateKey`.
 *
 * A frontend that does not know view ids ahead of time (e.g. the prebuilt
 * standalone SPA in `@devframes/json-render-ui`) subscribes to this one key to
 * discover which views exist, then subscribes to each view's own state. A hub
 * dock, by contrast, is handed a specific {@link JsonRenderViewRef} and needs
 * no index.
 */
export const JSON_RENDER_INDEX_KEY = 'devframe:json-render:index'

/**
 * One entry in the {@link JSON_RENDER_INDEX_KEY view index}. Fully
 * serializable: it locates a view's live state and carries the display title a
 * multi-view frontend uses to label it.
 */
export interface JsonRenderIndexEntry {
  /** Author-supplied stable id, unique within the view's scope. */
  id: string
  /** The view's scope segment (e.g. `global` or a context namespace). */
  scope: string
  /** Shared-state key the client subscribes to for the live spec + state. */
  stateKey: string
  /** Human-facing label for the view (defaults to `id`). */
  title: string
  /** Upstream `@json-render/*` version the view was authored against. */
  upstreamVersion: string
}

/** The shape of the view-index shared state: entries keyed by `stateKey`. */
export type JsonRenderIndex = Record<string, JsonRenderIndexEntry>
