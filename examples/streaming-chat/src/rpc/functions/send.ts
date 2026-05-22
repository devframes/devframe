import { defineRpcFunction } from 'devframe'
import { nanoid } from 'devframe/utils/nanoid'
import * as v from 'valibot'
import { HISTORY_KEY } from '../../constants.ts'
import { getStreamingChatContext } from '../../context.ts'

/**
 * Synthetic "AI" — splits a canned response into tokens and emits them
 * one at a time. Swap in `OpenAI`'s `chat.completions.create({ stream: true })`
 * (or any async iterable of strings) to make it real.
 */
function* fakeTokens(prompt: string): Generator<string> {
  const lower = prompt.toLowerCase()
  let response: string
  if (/^(?:hi|hello|hey)\b/.test(lower)) {
    response = `Hello! Ask me about devframe, streaming, or anything else — I'll fake-stream a response one token at a time.`
  }
  else if (lower.includes('haiku')) {
    response = 'Tiny chunks arrive — / type-safe over WebSocket / streams compose with ease.'
  }
  else if (lower.includes('streaming')) {
    response
      = 'Streams start with `ctx.rpc.streaming.create()` on the server. '
        + 'Producers `write()` chunks; clients subscribe and consume them via '
        + '`for await (const chunk of reader)`. Cancellation, replay, and '
        + 'backpressure are wired by the host — your handler stays small.'
  }
  else if (lower.includes('history') || lower.includes('persist')) {
    response
      = `History lives in a devframe shared state ("${HISTORY_KEY}"). `
        + 'Each `send` appends a user + assistant pair; tokens stream live, '
        + 'and the final content is committed back to the shared state when '
        + 'the producer closes. Refresh the page and the log comes back.'
  }
  else {
    response
      = `You asked: "${prompt}". `
        + 'devframe is a framework-neutral foundation for building developer '
        + 'tooling — six adapters, type-safe RPC, shared state, and a '
        + 'first-class streaming channel for delta-style server↔client data. '
        + 'Pipe `ReadableStream`s into a sink, or write chunks by hand.'
  }
  // Split on whitespace but keep the spaces so `tokens.join('')` round-trips.
  const tokens = response.split(/(\s+)/).filter(Boolean)
  for (const token of tokens) yield token
}

export const send = defineRpcFunction({
  name: 'devframe-streaming-chat:send',
  type: 'action',
  jsonSerializable: true,
  args: [v.object({
    prompt: v.string(),
    intervalMs: v.optional(v.number(), 35),
  })],
  returns: v.object({
    userId: v.string(),
    assistantId: v.string(),
    streamId: v.string(),
  }),
  setup: (ctx) => {
    const { channel, history, pruneIfTooLarge } = getStreamingChatContext(ctx)
    return {
      handler: async ({ prompt, intervalMs = 35 }) => {
        const stream = channel.start()
        const userId = nanoid()
        const assistantId = nanoid()
        const now = Date.now()

        // Append both messages atomically — clients see the user prompt
        // and the empty assistant placeholder appear together.
        history.mutate((draft) => {
          draft.messages.push({
            id: userId,
            role: 'user',
            content: prompt,
            timestamp: now,
          })
          draft.messages.push({
            id: assistantId,
            role: 'assistant',
            content: '',
            streamId: stream.id,
            timestamp: now,
          })
        })
        pruneIfTooLarge()

        // Producer — token-by-token via streaming, full content committed
        // to shared state when done so refreshes / new clients see the
        // finished message without re-streaming.
        ;(async () => {
          let acc = ''
          let cancelled = false
          try {
            for (const token of fakeTokens(prompt)) {
              if (stream.signal.aborted) {
                cancelled = true
                break
              }
              stream.write(token)
              acc += token
              await new Promise(r => setTimeout(r, intervalMs))
            }
            if (!cancelled)
              stream.close()
          }
          catch (err) {
            stream.error(err)
            history.mutate((draft) => {
              const msg = draft.messages.find(m => m.id === assistantId)
              if (msg) {
                msg.content = acc
                msg.streamId = undefined
                msg.cancelled = true
              }
            })
            return
          }

          history.mutate((draft) => {
            const msg = draft.messages.find(m => m.id === assistantId)
            if (msg) {
              msg.content = acc
              msg.streamId = undefined
              if (cancelled)
                msg.cancelled = true
            }
          })
        })()

        return { userId, assistantId, streamId: stream.id }
      },
    }
  },
})
