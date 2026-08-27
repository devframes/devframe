/**
 * `devframe/in-page-channel` — the browser-only communication path between
 * a devframe's page script and its panels: a same-origin, server-free,
 * typed channel of fire-and-forget events, request/response calls, and
 * page-script-authoritative shared state, over one handshaken
 * `MessageChannel` port per panel.
 */
export { defineChannelFunction } from './define'
export {
  InPageChannelError,
  type InPageChannelErrorCode,
} from './errors'
export { createPageScriptChannel } from './page-script'
export { connectPanelChannel } from './panel'
export {
  defaultHandshakeTargets,
  IN_PAGE_CHANNEL_TAG,
  IN_PAGE_CHANNEL_VERSION,
  type InPageChannelGrant,
  type InPageChannelHandshakeMessage,
  type InPageChannelHello,
} from './protocol'
export type {
  ConnectPanelChannelOptions,
  CreatePageScriptChannelOptions,
  InPageChannelCommonOptions,
  InPageChannelEndpoint,
  InPageChannelHeartbeatOptions,
  InPageChannelProtocol,
  InPageChannelSerializationOptions,
  InPageChannelStatus,
  InPageFunctionDefinition,
  InPageFunctionDefinitionAny,
  InPageFunctionSetupResult,
  InPageFunctionType,
  InPagePageScriptFunctions,
  InPagePanelFunctions,
  InPageSharedStateGetOptions,
  InPageSharedStateHost,
  InPageSharedStates,
  PageScriptChannel,
  PageScriptChannelEvents,
  PanelChannel,
  PanelChannelEvents,
  PanelPeer,
} from './types'
