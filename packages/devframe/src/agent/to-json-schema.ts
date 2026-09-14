import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

const FALLBACK_OBJECT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

/** A `~standard` prop that may also carry the Standard JSON Schema converter. */
type MaybeJsonSchema = StandardSchemaV1['~standard'] & Partial<StandardJSONSchemaV1['~standard']>

/**
 * Convert a Standard Schema to JSON Schema for the agent/MCP surface.
 *
 * Devframe stays validator-neutral, so conversion uses the schema's own
 * [Standard JSON Schema](https://standardschema.dev/) converter
 * (`~standard.jsonSchema`) when the validator provides one; zod 4 does,
 * for example. Validators without a native converter (e.g. valibot) degrade
 * to a permissive object schema rather than pulling in a converter library.
 */
function safeToJsonSchema(schema: StandardSchemaV1): unknown {
  const standard = schema['~standard'] as MaybeJsonSchema
  if (standard.jsonSchema) {
    try {
      return standard.jsonSchema.input({ target: 'draft-2020-12' })
    }
    catch {
      return FALLBACK_OBJECT_SCHEMA
    }
  }
  return FALLBACK_OBJECT_SCHEMA
}

/**
 * JSON Schema for an RPC return value on the agent/MCP surface.
 * @internal
 */
export function returnToJsonSchema(schema: StandardSchemaV1 | undefined): unknown {
  if (!schema)
    return undefined
  return safeToJsonSchema(schema)
}

/**
 * JSON Schema for an RPC function's positional args on the agent/MCP
 * surface. Each positional arg is advertised under `arg0` / `arg1` / …,
 * matching how the agent bridge coerces the incoming object payload back
 * into positional arguments.
 *
 * Returns `{ type: 'object', properties: {} }` when there are no args.
 * @internal
 */
export function argsToJsonSchema(
  args: readonly StandardSchemaV1[] | undefined,
): unknown {
  if (!args || args.length === 0)
    return { type: 'object', properties: {} }

  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (let i = 0; i < args.length; i++) {
    const key = `arg${i}`
    properties[key] = safeToJsonSchema(args[i]!)
    required.push(key)
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}
