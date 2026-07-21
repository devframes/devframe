import { z } from 'zod'

/**
 * Devframes-authored per-component prop schemas for the base catalog.
 *
 * Upstream `defineCatalog` collapses a multi-component `propsOf` to
 * `Record<string, unknown>`, so it validates component *names* but not
 * per-component *props*. These schemas are the one validation Devframes
 * adds: element props are parsed against the matching schema at both trust
 * boundaries — spec ingress (server) and render time (client).
 *
 * Each schema validates the types of the documented props and tolerates
 * extra keys (upstream directives like `$bindState` resolve to values at
 * render time), so validation catches genuine authoring mistakes without
 * rejecting valid dynamic expressions.
 */

// Two-way bindings and other `$`-prefixed dynamic expressions resolve to a
// concrete value only at render time. Accept them anywhere a scalar prop is
// expected so ingress validation never rejects a valid binding.
const dynamic = z.looseObject({}).and(z.record(z.string(), z.unknown()))

function scalar<T extends z.ZodTypeAny>(schema: T) {
  return z.union([schema, dynamic])
}

const str = scalar(z.string())
const num = scalar(z.number())
const bool = scalar(z.boolean())

export const StackPropsSchema = z.object({
  direction: z.enum(['row', 'column']).optional(),
  gap: num.optional(),
  padding: num.optional(),
  align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  justify: z.enum(['start', 'center', 'end', 'between', 'around']).optional(),
  wrap: bool.optional(),
  flex: scalar(z.union([z.number(), z.string()])).optional(),
})

export const CardPropsSchema = z.object({
  title: str.optional(),
  border: bool.optional(),
  collapsible: bool.optional(),
  defaultCollapsed: bool.optional(),
  loading: bool.optional(),
})

export const TextPropsSchema = z.object({
  text: str.optional(),
  variant: z.enum(['heading', 'subheading', 'body', 'caption', 'code']).optional(),
  weight: z.enum(['normal', 'medium', 'bold']).optional(),
  color: z.enum(['base', 'muted', 'faint', 'primary', 'success', 'warning', 'danger']).optional(),
})

export const BadgePropsSchema = z.object({
  text: str.optional(),
  variant: z.enum(['default', 'success', 'warning', 'danger', 'info']).optional(),
  minWidth: num.optional(),
})

export const ButtonPropsSchema = z.object({
  label: str.optional(),
  variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).optional(),
  icon: str.optional(),
  disabled: bool.optional(),
  loading: bool.optional(),
})

export const IconPropsSchema = z.object({
  name: str.optional(),
  size: num.optional(),
})

export const DividerPropsSchema = z.object({
  label: str.optional(),
})

export const TextInputPropsSchema = z.object({
  value: str.optional(),
  placeholder: str.optional(),
  label: str.optional(),
  disabled: bool.optional(),
  type: z.enum(['text', 'number', 'password', 'email', 'search']).optional(),
  loading: bool.optional(),
})

export const SwitchPropsSchema = z.object({
  value: bool.optional(),
  label: str.optional(),
  disabled: bool.optional(),
})

export const KeyValueTablePropsSchema = z.object({
  data: z.union([z.record(z.string(), z.unknown()), dynamic]).optional(),
  loading: bool.optional(),
})

export const DataTablePropsSchema = z.object({
  columns: scalar(z.array(z.union([
    z.string(),
    z.looseObject({ key: z.string(), label: z.string().optional() }),
  ]))).optional(),
  rows: scalar(z.array(z.unknown())).optional(),
  height: num.optional(),
  loading: bool.optional(),
})

export const CodeBlockPropsSchema = z.object({
  code: str.optional(),
  language: str.optional(),
  filename: str.optional(),
  height: num.optional(),
})

export const ProgressPropsSchema = z.object({
  value: num.optional(),
  max: num.optional(),
  label: str.optional(),
})

export const TreePropsSchema = z.object({
  data: z.unknown().optional(),
  defaultExpanded: bool.optional(),
})

/**
 * Map of base-catalog component name → Zod prop schema. The keys are the
 * canonical component set (catalog v1).
 */
export const basePropSchemas = {
  Stack: StackPropsSchema,
  Card: CardPropsSchema,
  Text: TextPropsSchema,
  Badge: BadgePropsSchema,
  Button: ButtonPropsSchema,
  Icon: IconPropsSchema,
  Divider: DividerPropsSchema,
  TextInput: TextInputPropsSchema,
  Switch: SwitchPropsSchema,
  KeyValueTable: KeyValueTablePropsSchema,
  DataTable: DataTablePropsSchema,
  CodeBlock: CodeBlockPropsSchema,
  Progress: ProgressPropsSchema,
  Tree: TreePropsSchema,
} as const satisfies Record<string, z.ZodType>

/** Canonical base-catalog component name. */
export type BaseComponentName = keyof typeof basePropSchemas

/** The ordered list of base-catalog component names (catalog v1). */
export const baseComponentNames = Object.keys(basePropSchemas) as BaseComponentName[]
