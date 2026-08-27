import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RpcArgsSchema } from '../rpc/types'
import type {
  InPageChannelEndpoint,
  InPageChannelSerializationOptions,
  InPageFunctionDefinitionAny,
} from './types'
import { assertJsonSerializable, InPageChannelError } from './errors'

/**
 * The local half of an endpoint's function table: definitions registered on
 * this side, resolved by name when the remote side calls in. Each resolved
 * handler is wrapped with the full receive pipeline — deserialize hook,
 * `jsonSerializable` enforcement, Standard-Schema argument validation,
 * lazy `setup`, and the serialize hook + `jsonSerializable` enforcement on
 * the way back out.
 */
export interface LocalFunctionRegistry {
  register: (definition: InPageFunctionDefinitionAny) => void
  resolve: (name: string) => ((...args: unknown[]) => unknown) | undefined
}

async function runStandardSchema(schema: StandardSchemaV1, value: unknown): Promise<StandardSchemaV1.Result<unknown>> {
  const result = schema['~standard'].validate(value)
  return result instanceof Promise ? await result : result
}

function formatIssues(issues: readonly StandardSchemaV1.Issue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path
        ?.map(segment => (typeof segment === 'object' ? segment.key : segment))
        .join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}

/**
 * Validate positional arguments against their declared Standard Schemas.
 * Mirrors the RPC layer's `validateRpcArgs`: only indices with a schema are
 * checked, values pass through unchanged, and the first failure rejects the
 * call with an `InPageChannelError` (code `invalid-args`).
 */
async function validateArgs(name: string, schemas: RpcArgsSchema, args: readonly unknown[]): Promise<void> {
  for (let index = 0; index < schemas.length; index++) {
    const schema = schemas[index]
    if (!schema)
      continue
    const result = await runStandardSchema(schema, args[index])
    if (result.issues) {
      throw new InPageChannelError(
        'invalid-args',
        `in-page function "${name}" rejected argument ${index}: ${formatIssues(result.issues)}`,
      )
    }
  }
}

export function createLocalFunctionRegistry(
  endpoint: () => InPageChannelEndpoint,
  serialization: InPageChannelSerializationOptions,
): LocalFunctionRegistry {
  const definitions = new Map<string, InPageFunctionDefinitionAny>()
  const wrapped = new Map<string, (...args: unknown[]) => unknown>()
  const setupResults = new Map<InPageFunctionDefinitionAny, Promise<((...args: any[]) => any) | undefined>>()

  async function resolveHandler(definition: InPageFunctionDefinitionAny): Promise<((...args: any[]) => any) | undefined> {
    if (definition.handler)
      return definition.handler
    if (!definition.setup)
      return undefined
    let pending = setupResults.get(definition)
    if (!pending) {
      pending = Promise.resolve(definition.setup(endpoint())).then(result => result.handler)
      setupResults.set(definition, pending)
    }
    return pending
  }

  function wrap(definition: InPageFunctionDefinitionAny): (...args: unknown[]) => unknown {
    return async (...rawArgs: unknown[]) => {
      const args = serialization.deserialize
        ? rawArgs.map(serialization.deserialize)
        : rawArgs
      if (definition.jsonSerializable)
        assertJsonSerializable(args, 'its arguments', definition.name)
      if (definition.args?.length)
        await validateArgs(definition.name, definition.args, args)
      const handler = await resolveHandler(definition)
      if (!handler) {
        throw new InPageChannelError(
          'invalid-args',
          `in-page function "${definition.name}" has no handler (neither \`handler\` nor \`setup\` provided one)`,
        )
      }
      let result = await handler(...args)
      if (definition.jsonSerializable)
        assertJsonSerializable(result, 'its return value', definition.name)
      if (serialization.serialize && result !== undefined)
        result = serialization.serialize(result)
      return result
    }
  }

  return {
    register(definition) {
      definitions.set(definition.name, definition)
      wrapped.set(definition.name, wrap(definition))
    },
    resolve(name) {
      return wrapped.get(name)
    },
  }
}
