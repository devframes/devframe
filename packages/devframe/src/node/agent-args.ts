/**
 * How {@link coerceAgentPositionalArgs} treats an args object that carries
 * neither declared schemas nor `arg0`/`arg1`/… keys:
 *
 * - `'wrap'` — pass the object itself as the single positional argument.
 *   RPC-backed tools use this: an untyped RPC may take one raw object.
 * - `'drop'` — call with zero arguments. Command-backed tools use this:
 *   a handler's positional parameters come solely from its declared
 *   `agent.args` schemas, so undeclared payload is ignored.
 */
export type AgentArgsFallback = 'wrap' | 'drop'

/**
 * Map the args payload an agent surface receives (MCP sends an object
 * keyed `arg0`/`arg1`/…, matching the schema the adapter advertises) onto
 * a handler's positional parameters. Shared by the agent host's RPC
 * bridge and the hub's command-derived tools so the coercion cannot
 * drift between them.
 *
 * - an array passes through as-is
 * - `null`/`undefined` become a zero-argument call
 * - with declared schemas, each schema reads its own `argN` key, in order
 * - without schemas, `arg0`/`arg1`/… keys are collected when present
 * - an empty object becomes a zero-argument call
 * - anything else follows the {@link AgentArgsFallback}
 *
 * @experimental
 */
export function coerceAgentPositionalArgs(
  args: unknown,
  schemas: readonly unknown[] | undefined,
  fallback: AgentArgsFallback = 'wrap',
): unknown[] {
  if (Array.isArray(args))
    return args
  if (args === undefined || args === null)
    return []
  if (typeof args === 'object') {
    const obj = args as Record<string, unknown>
    if (schemas && schemas.length)
      return schemas.map((_, i) => obj[`arg${i}`])
    if ('arg0' in obj) {
      const out: unknown[] = []
      let i = 0
      while (`arg${i}` in obj) {
        out.push(obj[`arg${i}`])
        i++
      }
      return out
    }
    if (Object.keys(obj).length === 0)
      return []
  }
  return fallback === 'drop' ? [] : [args]
}
