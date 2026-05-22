import { defineRpcFunction } from 'devframe'
import { getStreamingChatContext } from '../../context.ts'

export const clear = defineRpcFunction({
  name: 'devframe-streaming-chat:clear',
  type: 'action',
  jsonSerializable: true,
  setup: (ctx) => {
    const { history } = getStreamingChatContext(ctx)
    return {
      handler: () => {
        history.mutate((draft) => {
          draft.messages.length = 0
        })
      },
    }
  },
})
