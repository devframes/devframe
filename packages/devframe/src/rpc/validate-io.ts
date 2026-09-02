import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RpcArgsSchema, RpcReturnSchema } from './types'
import { diagnostics } from './diagnostics'

/**
 * Run a single [Standard Schema](https://standardschema.dev) validator,
 * awaiting the result when the validator is asynchronous.
 */
async function runStandardSchema<T extends StandardSchemaV1>(
  schema: T,
  value: unknown,
): Promise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<T>>> {
  const result = schema['~standard'].validate(value)
  return result instanceof Promise ? await result : result
}

/**
 * Render Standard Schema issues into a single human-readable line for a
 * diagnostic message, prefixing each with its dotted path when present.
 */
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
 * Validate positional arguments against their declared schemas. Only
 * indices with a schema are checked; extra arguments pass through
 * untouched. Throws `DF0038` on the first failing argument.
 *
 * Validation guards the payload without rewriting it: the original values
 * are handed to the handler unchanged, so a schema that describes a subset
 * of an object never silently strips the sender's extra fields (and any
 * declared transforms stay a purely type-level concern).
 *
 * @internal
 */
export async function validateRpcArgs(
  name: string,
  argsSchema: RpcArgsSchema | undefined,
  args: readonly unknown[],
): Promise<unknown[]> {
  const original = args.slice()
  if (!argsSchema || argsSchema.length === 0)
    return original

  for (let index = 0; index < argsSchema.length; index++) {
    const schema = argsSchema[index]
    if (!schema)
      continue
    const result = await runStandardSchema(schema, args[index])
    if (result.issues)
      throw diagnostics.DF0043({ name, index, issues: formatIssues(result.issues) })
  }

  return original
}

/**
 * Validate a handler's resolved return value against its declared schema.
 * Throws `DF0039` when the value fails the schema, otherwise returns the
 * original value unchanged (guard-only, never rewriting the payload - see
 * {@link validateRpcArgs}). Passes through when no return schema is set.
 *
 * @internal
 */
export async function validateRpcReturn(
  name: string,
  returnSchema: RpcReturnSchema | undefined,
  value: unknown,
): Promise<unknown> {
  if (!returnSchema)
    return value
  const result = await runStandardSchema(returnSchema, value)
  if (result.issues)
    throw diagnostics.DF0044({ name, issues: formatIssues(result.issues) })
  return value
}
