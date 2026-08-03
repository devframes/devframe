import type { StandardSchemaV1 } from '@standard-schema/spec'

const FALLBACK_OBJECT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

/**
 * JSON Schema for an RPC return value on the agent/MCP surface.
 *
 * [Standard Schema](https://standardschema.dev/) deliberately exposes no
 * JSON Schema, and devframe stays validator-neutral, so a declared return
 * schema advertises a permissive object rather than a precise shape.
 * @internal
 */
export function returnToJsonSchema(schema: StandardSchemaV1 | undefined): unknown {
  return schema ? FALLBACK_OBJECT_SCHEMA : undefined
}

/**
 * JSON Schema for an RPC function's positional args on the agent/MCP
 * surface. Each positional arg is advertised as a permissive object under
 * `arg0` / `arg1` / … — matching how the agent bridge coerces the incoming
 * object payload back into positional arguments.
 *
 * Returns `{ type: 'object', properties: {} }` when there are no args (the
 * MCP SDK treats this as "no input").
 * @internal
 */
export function argsToJsonSchema(
  args: readonly StandardSchemaV1[] | undefined,
): { schema: unknown, unwrapped: boolean } {
  if (!args || args.length === 0)
    return { schema: { type: 'object', properties: {} }, unwrapped: false }

  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (let i = 0; i < args.length; i++) {
    const key = `arg${i}`
    properties[key] = FALLBACK_OBJECT_SCHEMA
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
