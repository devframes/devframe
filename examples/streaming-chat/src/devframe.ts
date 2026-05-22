import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { CHANNEL_NAME, HISTORY_KEY, MAX_HISTORY } from './constants.ts'
import { setStreamingChatContext } from './context.ts'
import { serverFunctions } from './rpc/index.ts'

export type { ChatHistory, ChatMessage } from './types.ts'

const BASE_PATH = '/__devframe-streaming-chat/'
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url))

export default defineDevframe({
  id: 'devframe-streaming-chat',
  name: 'Streaming Chat',
  icon: 'ph:chat-circle-dots-duotone',
  basePath: BASE_PATH,
  cli: {
    command: 'devframe-streaming-chat',
    port: 9897,
    distDir,
    // Single-user localhost demo — skip the trust handshake that the
    // Vite-side surface requires.
    auth: false,
  },
  spa: { loader: 'none' },
  async setup(ctx) {
    const channel = ctx.rpc.streaming.create<string>(CHANNEL_NAME, {
      replayWindow: 1024,
    })
    const history = await ctx.rpc.sharedState.get(HISTORY_KEY, {
      initialValue: { messages: [] },
    })

    function pruneIfTooLarge(): void {
      if (history.value().messages.length > MAX_HISTORY) {
        history.mutate((draft) => {
          draft.messages.splice(0, draft.messages.length - MAX_HISTORY)
        })
      }
    }

    setStreamingChatContext(ctx, { channel, history, pruneIfTooLarge })

    for (const fn of serverFunctions)
      ctx.rpc.register(fn)
  },
})
