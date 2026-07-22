/**
 * The `@json-render/core` / `@json-render/vue` version this build of
 * `@devframes/json-render` is written and tested against. It is the sole
 * compatibility signal carried across the wire — there is no separate
 * Devframes protocol/catalog version stamp. A renderer compares its own
 * upstream version against a view's {@link JsonRenderViewRef.upstreamVersion}
 * and warns (rather than blocking) on a mismatch.
 *
 * Kept paired with the caret range on `@json-render/core` /
 * `@json-render/vue` in this package's manifest; the committed lockfile is
 * the guard against a breaking upstream upgrade.
 */
export const JSON_RENDER_UPSTREAM_VERSION = '0.19.0'

/**
 * The serializable reference to a JSON-render view that crosses process /
 * static boundaries — e.g. projected onto a hub dock entry. It carries **no
 * functions** and no Devframes catalog version: just the shared-state key the
 * client subscribes to for the live spec + state, and the upstream version
 * the view was authored against.
 *
 * This is the corrected projection contract: the previous hub implementation
 * leaked an accidental `_stateKey` field and a non-serializable renderer
 * handle; a `JsonRenderViewRef` is a plain, fully-serializable object.
 */
export interface JsonRenderViewRef {
  /** Shared-state key the client subscribes to for the live spec + state. */
  stateKey: string
  /** Upstream `@json-render/*` version the view was authored against. */
  upstreamVersion: string
}
