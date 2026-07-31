import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'
import { toJsonSchema } from '@valibot/to-json-schema'

const FALLBACK_OBJECT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

/**
 * Convert a Standard Schema return schema to JSON Schema.
 * @internal
 */
export function returnToJsonSchema(schema: StandardSchemaV1 | undefined): unknown {
  if (!schema)
    return undefined
  return safeToJsonSchema(schema)
}

/**
 * Convert positional RPC args schemas to a single MCP-friendly object
 * schema. When the RPC declares `args: [v.object(...)]`, unwrap the
 * single-object schema directly (nicer agent UX than `{ arg0: {...} }`).
 *
 * Returns `undefined` when there are no args (the MCP SDK treats this
 * as `{ type: 'object', properties: {} }`).
 * @internal
 */
export function argsToJsonSchema(
  args: readonly StandardSchemaV1[] | undefined,
): { schema: unknown, unwrapped: boolean } {
  if (!args || args.length === 0)
    return { schema: { type: 'object', properties: {} }, unwrapped: false }

  // Single-object arg: unwrap.
  if (args.length === 1) {
    const inner = safeToJsonSchema(args[0]!)
    if (isObjectJsonSchema(inner))
      return { schema: inner, unwrapped: true }
    // Non-object single arg (e.g. a string): fall through to arg0 shape.
  }

  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (let i = 0; i < args.length; i++) {
    const key = `arg${i}`
    const s = safeToJsonSchema(args[i]!)
    properties[key] = s
    // Positional args carry no optionality signal at this layer, so every
    // one is conservatively marked required.
    required.push(key)
  }

  return {
    schema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
    unwrapped: false,
  }
}

type StandardSchemaProps = StandardSchemaV1['~standard'] & Partial<StandardJSONSchemaV1['~standard']>

function safeToJsonSchema(schema: StandardSchemaV1): unknown {
  const standard = schema['~standard'] as StandardSchemaProps
  try {
    if (standard.jsonSchema)
      return standard.jsonSchema.input({ target: 'draft-2020-12' })
    return toJsonSchema(schema as any)
  }
  catch {
    return FALLBACK_OBJECT_SCHEMA
  }
}

function isObjectJsonSchema(value: unknown): boolean {
  return (
    !!value
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'object'
  )
}
