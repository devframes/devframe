import type { WhenContext, WhenExpression } from 'devframe/utils/when'
import type { DevframeHubContext } from './node/context'
import type { DevframeServerCommandInput } from './types/commands'
import type { DevframeDockUserEntry } from './types/docks'
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
