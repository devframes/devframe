import type { DevframeNodeContext, RpcStreamingChannel } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { ChatHistory } from './types.ts'

export interface StreamingChatContext {
  channel: RpcStreamingChannel<string>
  history: SharedState<ChatHistory>
  pruneIfTooLarge: () => void
}

const map = new WeakMap<DevframeNodeContext, StreamingChatContext>()

export function setStreamingChatContext(ctx: DevframeNodeContext, value: StreamingChatContext): void {
  map.set(ctx, value)
}

export function getStreamingChatContext(ctx: DevframeNodeContext): StreamingChatContext {
  const value = map.get(ctx)
  if (!value)
    throw new Error('streaming-chat context not initialised — call setStreamingChatContext in devframe.setup')
  return value
}
