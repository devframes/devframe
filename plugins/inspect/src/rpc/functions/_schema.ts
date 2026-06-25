import { toJsonSchema } from '@valibot/to-json-schema'

const FALLBACK_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

/**
 * Convert a valibot return schema to JSON Schema, swallowing
 * conversion failures (unsupported valibot actions) into a permissive
 * fallback so introspection never throws.
 */
export function returnSchemaToJson(schema: unknown): unknown {
  if (!schema)
    return undefined
  try {
    return toJsonSchema(schema as never)
  }
  catch {
    return FALLBACK_SCHEMA
  }
}

/**
 * Convert the positional args valibot schemas to a single JSON Schema
 * tuple (`type: 'array'` + `prefixItems`). Returns `undefined` when the
 * function declares no args.
 */
export function argsSchemaToJson(args: readonly unknown[] | undefined): unknown {
  if (!args || args.length === 0)
    return undefined
  return {
    type: 'array',
    prefixItems: args.map((arg) => {
      try {
        return toJsonSchema(arg as never)
      }
      catch {
        return FALLBACK_SCHEMA
      }
    }),
  }
}
