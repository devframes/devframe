import type { StandardSchemaV1 } from '@standard-schema/spec'
import { toJsonSchema } from '@standard-community/standard-json'

const FALLBACK_OBJECT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

/**
 * Convert a Standard Schema to JSON Schema for the agent/MCP surface.
 *
 * `@standard-community/standard-json` dispatches on the schema's
 * `~standard` vendor (valibot, zod, arktype, …) and lazily loads that
 * vendor's converter, so precise schemas require the matching converter
 * to be installed (e.g. `@valibot/to-json-schema`, `zod-to-json-schema`).
 * When no converter is available — or conversion fails — we degrade to a
 * permissive object schema so the surface never throws and no validator is
 * forced.
 */
async function safeToJsonSchema(schema: StandardSchemaV1): Promise<unknown> {
  try {
    return await toJsonSchema(schema)
  }
  catch {
    return FALLBACK_OBJECT_SCHEMA
  }
}

/**
 * JSON Schema for an RPC return value on the agent/MCP surface.
 * @internal
 */
export async function returnToJsonSchema(schema: StandardSchemaV1 | undefined): Promise<unknown> {
  if (!schema)
    return undefined
  return safeToJsonSchema(schema)
}

/**
 * JSON Schema for an RPC function's positional args on the agent/MCP
 * surface. Each positional arg is advertised under `arg0` / `arg1` / … —
 * matching how the agent bridge coerces the incoming object payload back
 * into positional arguments.
 *
 * Returns `{ type: 'object', properties: {} }` when there are no args.
 * @internal
 */
export async function argsToJsonSchema(
  args: readonly StandardSchemaV1[] | undefined,
): Promise<{ schema: unknown, unwrapped: boolean }> {
  if (!args || args.length === 0)
    return { schema: { type: 'object', properties: {} }, unwrapped: false }

  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (let i = 0; i < args.length; i++) {
    const key = `arg${i}`
    properties[key] = await safeToJsonSchema(args[i]!)
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
