import type { RpcFunctionDefinition, RpcFunctionSetupResult, RpcFunctionType } from './types'
import { diagnostics } from './diagnostics'

export async function getRpcResolvedSetupResult<
  NAME extends string,
  TYPE extends RpcFunctionType,
  ARGS extends any[],
  RETURN = void,
  CONTEXT = undefined,
>(
  definition: RpcFunctionDefinition<NAME, TYPE, ARGS, RETURN, any, any, CONTEXT>,
  context: CONTEXT,
): Promise<RpcFunctionSetupResult<ARGS, RETURN>> {
  if (!definition.setup) {
    return {}
  }

  // Cache the setup result per-context so a single module-level definition
  // can serve multiple contexts in the same process (multi-server tests,
  // hot-reload teardown/replay, etc.) without leaking a handler that
  // closed over a prior context's state.
  if (typeof context === 'object' && context !== null) {
    definition.__cache ??= new WeakMap()
    let promise = definition.__cache.get(context as object)
    if (!promise) {
      promise = Promise.resolve(definition.setup(context))
      definition.__cache.set(context as object, promise)
    }
    return await promise
  }

  // Primitive / undefined context — fall back to a single-slot cache.
  definition.__promise ??= Promise.resolve(definition.setup(context))
  return await definition.__promise
}

export async function getRpcHandler<
  NAME extends string,
  TYPE extends RpcFunctionType,
  ARGS extends any[],
  RETURN = void,
  CONTEXT = undefined,
>(
  definition: RpcFunctionDefinition<NAME, TYPE, ARGS, RETURN, any, any, CONTEXT>,
  context: CONTEXT,
): Promise<(...args: ARGS) => RETURN> {
  if (definition.handler) {
    return definition.handler
  }
  const result = await getRpcResolvedSetupResult(definition, context)
  if (!result.handler) {
    throw diagnostics.DF0024({ name: definition.name })
  }
  return result.handler
}
