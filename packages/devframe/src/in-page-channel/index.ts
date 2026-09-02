import type { RpcArgsSchema, RpcReturnSchema } from '../rpc/types'
import type { InPageFunctionDefinition, InPageFunctionType } from './types'

/**
 * `devframe/in-page-channel` - the browser-only communication path between
 * a devframe's page script and its panels: a same-origin, server-free,
 * typed channel of fire-and-forget events, request/response calls, and
 * page-script-authoritative shared state, over one handshaken
 * `MessageChannel` port per panel.
 */
export { InPageChannelError, type InPageChannelErrorCode } from './internal'
export { createPageScriptChannel } from './page-script'
export { connectPanelChannel } from './panel'
export type {
  ConnectPanelChannelOptions,
  CreatePageScriptChannelOptions,
  InPageChannelProtocol,
  InPageChannelStatus,
  InPageFunctionDefinition,
  PageScriptChannel,
  PanelChannel,
  PanelPeer,
} from './types'

/**
 * Define one in-page channel function - the `defineRpcFunction` authoring
 * shape narrowed to the browser (see {@link InPageFunctionDefinition}).
 * Pure identity: it only types the definition. Functions live in
 * side-specific files and are passed to their endpoint via `functions`; the
 * shared protocol file carries only the contract type and the channel-name
 * constant.
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
