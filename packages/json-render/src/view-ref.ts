import type { DevframeJsonRenderSpec } from './types'

/**
 * A view backed by **live shared state**: the client subscribes to `stateKey`
 * for the spec + state and re-renders on every update. This is what a
 * node-authored view ({@link import('./node/create-view').createJsonRenderView})
 * produces.
 */
export interface JsonRenderViewStateRef {
  /** Shared-state key the client subscribes to for the live spec + state. */
  stateKey: string
}

/**
 * A view whose spec is embedded **inline** in the reference. It carries no
 * shared-state key, so a client can synthesize a view entirely in the browser
 * and hand it straight to a renderer — no `sharedState` round-trip. The spec is
 * rendered as-is (static: local state and bindings still work, but there is no
 * server-driven live update stream).
 */
export interface JsonRenderViewInlineRef {
  /** The full spec, carried in the reference itself. */
  spec: DevframeJsonRenderSpec
}

/**
 * The serializable reference to a JSON-render view that crosses process /
 * static boundaries — e.g. projected onto a hub dock entry. It carries **no
 * functions**: either a {@link JsonRenderViewStateRef.stateKey shared-state key}
 * the client subscribes through, or an {@link JsonRenderViewInlineRef.spec
 * inline spec} rendered directly.
 */
export type JsonRenderViewRef = JsonRenderViewStateRef | JsonRenderViewInlineRef
