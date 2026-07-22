/**
 * Curated, named re-exports of `@json-render/core` — the upstream wire
 * contract Devframes builds on. This is an **explicit** allowlist (never
 * `export *`): every name here is a Devframes semver commitment, so the
 * surface stays small and reviewed. Streaming, prompt/generation, and
 * devtools hooks are deliberately excluded from the base contract (a
 * streaming subpath may be added later, see the plan).
 *
 * @see https://www.npmjs.com/package/@json-render/core
 */

// ── Builders (values) ────────────────────────────────────────────────────
export {
  createStateStore,
  defineCatalog,
  defineSchema,
} from '@json-render/core'

// ── Spec / element / state types ─────────────────────────────────────────
export type {
  Spec,
  StateModel,
  StateStore,
  UIElement,
} from '@json-render/core'

// ── Catalog & schema typing (inference helpers) ──────────────────────────
export type {
  Catalog,
  InferActionParams,
  InferCatalogActions,
  InferCatalogComponents,
  InferCatalogInput,
  InferComponentProps,
  InferSpec,
  Schema,
  SchemaBuilder,
  SchemaDefinition,
  SchemaOptions,
  SchemaType,
} from '@json-render/core'
