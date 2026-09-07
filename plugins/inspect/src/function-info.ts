import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'
import type { RpcFunctionDefinitionAnyWithContext } from 'devframe/rpc'
import type { RpcFunctionAgentInfo, RpcFunctionInfo } from './node/types'

const FALLBACK_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

/** Function types the inspector invokes (read-only; no side effects). */
export const INVOKABLE_TYPES: ReadonlySet<string> = new Set(['query', 'static'])

/**
 * Project one registered RPC definition into the JSON-safe
 * {@link RpcFunctionInfo} the inspector renders. Shared by the node-side
 * `list-functions` RPC and the browser-side Client tab (which projects
 * `rpc.client` definitions locally), so the two listings cannot drift.
 */
export function projectRpcFunctionInfo<CONTEXT>(
  name: string,
  fn: RpcFunctionDefinitionAnyWithContext<CONTEXT>,
): RpcFunctionInfo {
  const type = (fn.type ?? 'query') as RpcFunctionInfo['type']
  let agent: RpcFunctionAgentInfo | undefined
  if (fn.agent) {
    agent = {
      description: fn.agent.description,
      title: fn.agent.title,
      safety: fn.agent.safety,
      tags: fn.agent.tags,
    }
  }
  return {
    name,
    type,
    jsonSerializable: fn.jsonSerializable === true,
    snapshot: (fn as { snapshot?: boolean }).snapshot === true,
    cacheable: (fn as { cacheable?: boolean }).cacheable === true,
    hasArgs: !!fn.args,
    hasReturns: !!fn.returns,
    hasDump: !!fn.dump,
    hasSetup: !!fn.setup,
    hasHandler: !!fn.handler,
    invokable: INVOKABLE_TYPES.has(type),
    agent,
    argsSchema: argsSchemaToJson(fn.args as readonly unknown[] | undefined),
    returnsSchema: returnSchemaToJson(fn.returns),
  }
}

/** A `~standard` prop that may also carry the Standard JSON Schema converter. */
type MaybeJsonSchema = StandardSchemaV1['~standard'] & Partial<StandardJSONSchemaV1['~standard']>

/**
 * Convert a schema to JSON Schema for the inspector, vendor-neutrally.
 *
 * Uses the schema's own [Standard JSON Schema](https://standardschema.dev/)
 * converter (`~standard.jsonSchema`, implemented by e.g. zod 4) when the
 * validator provides one, and degrades to a permissive object schema
 * otherwise (e.g. valibot, which has no native converter), so introspection
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
function returnSchemaToJson(schema: unknown): unknown {
  if (!schema)
    return undefined
  return convert(schema)
}

/**
 * Convert positional args schemas to a single JSON Schema tuple
 * (`type: 'array'` + `prefixItems`). Returns `undefined` when the function
 * declares no args.
 */
function argsSchemaToJson(args: readonly unknown[] | undefined): unknown {
  if (!args || args.length === 0)
    return undefined
  return {
    type: 'array',
    prefixItems: args.map(arg => convert(arg)),
  }
}
