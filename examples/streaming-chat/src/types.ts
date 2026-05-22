import type { HISTORY_KEY } from './constants.ts'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Set on assistant messages while their stream is in flight. */
  streamId?: string
  /** True if the assistant stream was cancelled before completing. */
  cancelled?: boolean
  timestamp: number
}

export interface ChatHistory {
  messages: ChatMessage[]
}

declare module 'devframe/types' {
  interface DevToolsRpcSharedStates {
    [HISTORY_KEY]: ChatHistory
  }
}
