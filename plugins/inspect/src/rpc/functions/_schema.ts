import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

const FALLBACK_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

/** A `~standard` prop that may also carry the Standard JSON Schema converter. */
type MaybeJsonSchema = StandardSchemaV1['~standard'] & Partial<StandardJSONSchemaV1['~standard']>

/**
 * Convert a schema to JSON Schema for the inspector, vendor-neutrally.
 *
 * Uses the schema's own [Standard JSON Schema](https://standardschema.dev/)
 * converter (`~standard.jsonSchema`, implemented by e.g. zod 4) when the
 * validator provides one, and degrades to a permissive object schema
 * otherwise (e.g. valibot, which has no native converter) — so introspection
 * never throws and never pulls in a converter library for a validator devframe
 * doesn't otherwise depend on.
 */
function convert(schema: unknown): unknown {
  const standard = (schema as StandardSchemaV1)['~standard'] as MaybeJsonSchema
  if (!standard.jsonSchema)
    return FALLBACK_SCHEMA
  try {
    return standard.jsonSchema.input({ target: 'draft-2020-12' })
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
