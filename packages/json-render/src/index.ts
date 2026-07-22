// ── Base catalog + Devframes-authored prop schemas ───────────────────────
export { baseCatalog, baseSchema } from './catalog'
// ── Re-exported upstream protocol types (from the curated `./core` list) ──
export type {
  Catalog,
  InferComponentProps,
  Spec,
  StateModel,
  StateStore,
  UIElement,
} from './core'

export type { BaseComponentName } from './prop-schemas'

export {
  BadgePropsSchema,
  baseComponentNames,
  basePropSchemas,
  ButtonPropsSchema,
  CardPropsSchema,
  CodeBlockPropsSchema,
  DataTablePropsSchema,
  DividerPropsSchema,
  IconPropsSchema,
  KeyValueTablePropsSchema,
  ProgressPropsSchema,
  StackPropsSchema,
  SwitchPropsSchema,
  TextInputPropsSchema,
  TextPropsSchema,
  TreePropsSchema,
} from './prop-schemas'

// ── Devframes-facing type names ──────────────────────────────────────────
export type { DevframeJsonRenderSpec, JsonRenderView } from './types'
// ── View index (frontend view discovery) ─────────────────────────────────
export { JSON_RENDER_INDEX_KEY } from './view-index'

export type { JsonRenderIndex, JsonRenderIndexEntry } from './view-index'
// ── Serializable view reference ──────────────────────────────────────────
export { JSON_RENDER_UPSTREAM_VERSION } from './view-ref'
export type { JsonRenderViewRef } from './view-ref'
