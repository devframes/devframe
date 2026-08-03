import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'
import { toJsonSchema } from '@valibot/to-json-schema'

const FALLBACK_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

/** A `~standard` prop that may also carry the Standard JSON Schema converter. */
type MaybeJsonSchema = StandardSchemaV1['~standard'] & Partial<StandardJSONSchemaV1['~standard']>

/**
 * Convert a schema to JSON Schema for the inspector, vendor-neutrally.
 *
 * Prefers the schema's own Standard JSON Schema converter
 * (`~standard.jsonSchema`, implemented by e.g. zod 4), then falls back to
 * valibot's converter, then to a permissive object — so introspection never
 * throws regardless of which validator produced the schema.
 */
function convert(schema: unknown): unknown {
  const standard = (schema as StandardSchemaV1)['~standard'] as MaybeJsonSchema
  try {
    if (standard.jsonSchema)
      return standard.jsonSchema.input({ target: 'draft-2020-12' })
    return toJsonSchema(schema as never)
  }
  catch {
    return FALLBACK_SCHEMA
  }
}

/**
 * Convert an RPC return schema to JSON Schema, swallowing conversion
 * failures into a permissive fallback so introspection never throws.
 */
export function returnSchemaToJson(schema: unknown): unknown {
  if (!schema)
    return undefined
  return convert(schema)
}

/**
 * Convert positional args schemas to a single JSON Schema tuple
 * (`type: 'array'` + `prefixItems`). Returns `undefined` when the function
 * declares no args.
 */
export function argsSchemaToJson(args: readonly unknown[] | undefined): unknown {
  if (!args || args.length === 0)
    return undefined
  return {
    type: 'array',
    prefixItems: args.map(arg => convert(arg)),
  }
}
