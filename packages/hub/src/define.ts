import type { WhenContext, WhenExpression } from 'devframe/utils/when'
import type { HubNodeContext } from './node/context'
import type { DevToolsServerCommandInput } from './types/commands'
import type { DevToolsDockUserEntry } from './types/docks'
import type { JsonRenderSpec } from './types/json-render'
import { createDefineWrapperWithContext } from 'devframe/rpc'

export const defineRpcFunction = createDefineWrapperWithContext<HubNodeContext>()

export function defineCommand<const W extends string = ''>(
  command: Omit<DevToolsServerCommandInput, 'when'> & { when?: WhenExpression<WhenContext, W> },
): DevToolsServerCommandInput {
  return command as DevToolsServerCommandInput
}

export function defineDockEntry<
  const T extends DevToolsDockUserEntry,
  const W extends string = '',
>(
  entry: Omit<T, 'when'> & { when?: WhenExpression<WhenContext, W> },
): T {
  return entry as unknown as T
}

export function defineJsonRenderSpec(spec: JsonRenderSpec): JsonRenderSpec {
  return spec
}
