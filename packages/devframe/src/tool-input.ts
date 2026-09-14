/**
 * Convert an object-shaped tool input into positional arguments.
 *
 * Tool schemas expose positional parameters as `arg0`, `arg1`, and so on.
 * Arrays pass through for callers that already provide positional arguments.
 */
function collectPositionalArgs(input: unknown, argumentCount: number | undefined): unknown[] | undefined {
  if (Array.isArray(input))
    return input
  if (input === undefined || input === null)
    return []
  if (typeof input !== 'object')
    return undefined

  const record = input as Record<string, unknown>
  if (argumentCount != null)
    return Array.from({ length: argumentCount }, (_, index) => record[`arg${index}`])
  if ('arg0' in record) {
    const positional: unknown[] = []
    while (`arg${positional.length}` in record)
      positional.push(record[`arg${positional.length}`])
    return positional
  }
  return Object.keys(record).length === 0 ? [] : undefined
}

/** Convert tool input for an RPC, preserving an untyped payload as arg 0. */
export function toolInputToRpcArgs(input: unknown, argumentCount?: number): unknown[] {
  return collectPositionalArgs(input, argumentCount) ?? [input]
}

/** Convert tool input for a command, whose arguments must be declared. */
export function toolInputToCommandArgs(input: unknown, argumentCount?: number): unknown[] {
  return collectPositionalArgs(input, argumentCount) ?? []
}

/** @deprecated Use {@link toolInputToRpcArgs} or {@link toolInputToCommandArgs}. */
export type AgentArgsFallback = 'wrap' | 'drop'

/** @deprecated Use {@link toolInputToRpcArgs} or {@link toolInputToCommandArgs}. */
export function coerceAgentPositionalArgs(
  input: unknown,
  schemas: readonly unknown[] | undefined,
  fallback: AgentArgsFallback = 'wrap',
): unknown[] {
  const argumentCount = schemas?.length
  return fallback === 'drop'
    ? toolInputToCommandArgs(input, argumentCount)
    : toolInputToRpcArgs(input, argumentCount)
}
