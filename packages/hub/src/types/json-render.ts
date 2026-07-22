// Deprecated compatibility shim for the pre-0.7 hub-local json-render types.
//
// 0.7 moved json-render out of the hub into the opt-in `@devframes/json-render`
// integration — use its `DevframeJsonRenderSpec` (from `@devframes/json-render`)
// and `createJsonRenderView` (from `@devframes/json-render/node`) instead. These
// types are kept so existing imports keep compiling; they will be removed in a
// future major release.

/** @deprecated Use `DevframeJsonRenderSpec`'s element shape from `@devframes/json-render` instead. */
export interface JsonRenderElement {
  type: string
  props?: Record<string, unknown>
  children?: string[]
  /** json-render event bindings (e.g. `{ press: { action: "my:action" } }`) */
  on?: Record<string, unknown>
  /** json-render visibility condition */
  visible?: unknown
  /** json-render repeat binding */
  repeat?: unknown
  /** Allow additional json-render element fields */
  [key: string]: unknown
}

/** @deprecated Use `DevframeJsonRenderSpec` from `@devframes/json-render` instead. */
export interface JsonRenderSpec {
  root: string
  elements: Record<string, JsonRenderElement>
  /** Initial client-side state model for $state/$bindState expressions */
  state?: Record<string, unknown>
}

/** @deprecated Use `JsonRenderView` from `@devframes/json-render` instead. */
export interface JsonRenderer {
  /** Replace the entire spec */
  updateSpec: (spec: JsonRenderSpec) => void | Promise<void>
  /** Update json-render state values (shallow merge into spec.state) */
  updateState: (state: Record<string, unknown>) => void | Promise<void>
  /** Internal: shared state key used by the client to subscribe */
  readonly _stateKey: string
}
