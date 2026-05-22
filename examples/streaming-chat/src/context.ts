import type { DevToolsNodeContext, RpcStreamingChannel } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { ChatHistory } from './types.ts'

export interface StreamingChatContext {
  channel: RpcStreamingChannel<string>
  history: SharedState<ChatHistory>
  pruneIfTooLarge: () => void
}

const map = new WeakMap<DevToolsNodeContext, StreamingChatContext>()

export function setStreamingChatContext(ctx: DevToolsNodeContext, value: StreamingChatContext): void {
  map.set(ctx, value)
}

export function getStreamingChatContext(ctx: DevToolsNodeContext): StreamingChatContext {
  const value = map.get(ctx)
  if (!value)
    throw new Error('streaming-chat context not initialised — call setStreamingChatContext in devframe.setup')
  return value
}
