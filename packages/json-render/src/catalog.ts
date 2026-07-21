import { defineCatalog, defineSchema } from '@json-render/core'
import { basePropSchemas } from './prop-schemas'

/**
 * The Devframes base-catalog schema. A Devframes spec is an
 * `@json-render/core` `Spec` (flat `root` + `elements` map); the structural
 * fields upstream's Vue schema omits (`state`, `on`, `repeat`, `watch`) pass
 * through unchecked. The one validation Devframes adds is per-component prop
 * validation (see {@link basePropSchemas}).
 */
export const baseSchema = defineSchema(s => ({
  spec: s.object({
    root: s.string(),
    elements: s.record(s.object({
      type: s.ref('catalog.components'),
      props: s.propsOf('catalog.components'),
      children: s.array(s.string()),
    })),
  }),
  catalog: s.object({
    components: s.map({
      props: s.zod(),
      description: s.string(),
    }),
    actions: s.map({
      description: s.string(),
    }),
  }),
}))

const componentDescriptions: Record<keyof typeof basePropSchemas, string> = {
  Stack: 'Flex row/column container with gap, padding, alignment and justification.',
  Card: 'Bordered container with an optional title and collapsible body.',
  Text: 'Typographic text — heading, subheading, body, caption or inline code.',
  Badge: 'Small status pill with a semantic variant.',
  Button: 'Clickable button with a variant, optional icon and loading state.',
  Icon: 'Renders an icon resolved by name at runtime.',
  Divider: 'Horizontal rule with an optional centered label.',
  TextInput: 'Single-line text input with two-way state binding.',
  Switch: 'Accessible on/off toggle bound to a boolean state value.',
  KeyValueTable: 'Two-column table of key/value pairs.',
  DataTable: 'Tabular data with columns, rows and optional scroll height.',
  CodeBlock: 'Preformatted code block with a filename and language label.',
  Progress: 'Determinate progress bar.',
  Tree: 'Recursive object/array viewer with expandable nodes.',
}

/**
 * The Devframes base catalog (catalog v1): the fourteen canonical components
 * with their Devframes-authored Zod prop schemas and descriptions, and an
 * empty action set (actions are dispatched dynamically via the bridge, they
 * are not declared here). Reference frontend libraries implement this set.
 */
export const baseCatalog = defineCatalog(baseSchema, {
  components: Object.fromEntries(
    (Object.keys(basePropSchemas) as (keyof typeof basePropSchemas)[]).map(name => [
      name,
      { props: basePropSchemas[name], description: componentDescriptions[name] },
    ]),
  ) as {
    [K in keyof typeof basePropSchemas]: { props: typeof basePropSchemas[K], description: string }
  },
  actions: {},
})
