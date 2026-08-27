import type { RpcArgsSchema, RpcReturnSchema } from '../rpc/types'
import type { InPageFunctionDefinition, InPageFunctionType } from './types'

/**
 * Define one in-page channel function — the same authoring shape as
 * `defineRpcFunction`, narrowed to the browser (see
 * {@link InPageFunctionDefinition}). Pure identity: it only types the
 * definition.
 *
 * Functions live in side-specific files (page-script functions under the
 * page script's source, panel functions under the panel's) and are passed
 * to their endpoint via `functions` or `register()`; the shared protocol
 * file carries only the contract type and the channel-name constant.
 */
export function defineChannelFunction<
  NAME extends string,
  TYPE extends InPageFunctionType,
  ARGS extends any[],
  RETURN = void,
  const AS extends RpcArgsSchema | undefined = undefined,
  const RS extends RpcReturnSchema | undefined = undefined,
>(
  definition: InPageFunctionDefinition<NAME, TYPE, ARGS, RETURN, AS, RS>,
): InPageFunctionDefinition<NAME, TYPE, ARGS, RETURN, AS, RS> {
  return definition
}
