import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { CHANNEL, HISTORY, MAX_HISTORY, NAMESPACE } from './constants.ts'
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
    // A scoped context auto-namespaces channel + state ids with `NAMESPACE:`.
    const my = ctx.scope(NAMESPACE)

    const channel = my.rpc.streaming.create<string>(CHANNEL, { // -> devframe-streaming-chat:tokens
      replayWindow: 1024,
    })
    const history = await my.rpc.sharedState(HISTORY, { // -> devframe-streaming-chat:history
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
      my.rpc.register(fn)
  },
})
