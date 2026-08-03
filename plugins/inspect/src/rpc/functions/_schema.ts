import type { StandardSchemaV1 } from '@standard-schema/spec'
import { toJsonSchema } from '@standard-community/standard-json'

const FALLBACK_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

async function convert(schema: unknown): Promise<unknown> {
  try {
    return await toJsonSchema(schema as StandardSchemaV1)
  }
  catch {
    return FALLBACK_SCHEMA
  }
}

/**
 * Convert an RPC return schema to JSON Schema, swallowing conversion
 * failures (unsupported vendor / missing converter) into a permissive
 * fallback so introspection never throws.
 *
 * Conversion is vendor-neutral via `@standard-community/standard-json`,
 * which loads the matching per-vendor converter on demand (valibot, zod,
 * arktype, …) — install the converter for the vendor you inspect.
 */
export async function returnSchemaToJson(schema: unknown): Promise<unknown> {
  if (!schema)
    return undefined
  return convert(schema)
}

/**
 * Convert positional args schemas to a single JSON Schema tuple
 * (`type: 'array'` + `prefixItems`). Returns `undefined` when the function
 * declares no args.
 */
export async function argsSchemaToJson(args: readonly unknown[] | undefined): Promise<unknown> {
  if (!args || args.length === 0)
    return undefined
  return {
    type: 'array',
    prefixItems: await Promise.all(args.map(arg => convert(arg))),
  }
}
