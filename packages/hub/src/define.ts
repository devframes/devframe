import type { WhenContext, WhenExpression } from 'devframe/utils/when'
import type { DevframeHubContext } from './node/context'
import type { DevframeServerCommandInput } from './types/commands'
import type { DevframeDockUserEntry } from './types/docks'
import type { JsonRenderSpec } from './types/json-render'
import { createDefineWrapperWithContext } from 'devframe/rpc'

export const defineHubRpcFunction = createDefineWrapperWithContext<DevframeHubContext>()

export function defineCommand<const W extends string = ''>(
  command: Omit<DevframeServerCommandInput, 'when'> & { when?: WhenExpression<WhenContext, W> },
): DevframeServerCommandInput {
  return command as DevframeServerCommandInput
}

export function defineDockEntry<
  const T extends DevframeDockUserEntry,
  const W extends string = '',
>(
  entry: Omit<T, 'when'> & { when?: WhenExpression<WhenContext, W> },
): T {
  return entry as unknown as T
}

/**
 * @deprecated json-render moved out of the hub into the opt-in
 * `@devframes/json-render` integration in 0.7. This identity helper is kept
 * so existing imports keep compiling — pass your spec directly to
 * `createJsonRenderView` (from `@devframes/json-render/node`) instead.
 * Removed in 0.8.
 */
export function defineJsonRenderSpec(spec: JsonRenderSpec): JsonRenderSpec {
  return spec
}
