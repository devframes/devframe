import type { DevframeScopedClientContext } from 'devframe/client'
import type { StreamReader } from 'devframe/utils/streaming-channel'
import type { ChatHistory, ChatMessage } from '../types'
import { connectDevframe } from 'devframe/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { CHANNEL, HISTORY, NAMESPACE } from '../constants'
import { button, cx, input, nav, navBrand, spinner } from './design'

type ChatCtx = DevframeScopedClientContext<typeof NAMESPACE>

export function App() {
  const [ctx, setCtx] = useState<ChatCtx | null>(null)
  const [demoPrompts, setDemoPrompts] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [liveTokens, setLiveTokens] = useState<Record<string, string>>({})
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const readersRef = useRef<Map<string, StreamReader<string>>>(new Map())
  const messagesRef = useRef<HTMLDivElement | null>(null)

  // Connect once and surface demo prompts.
  useEffect(() => {
    let cancelled = false
    connectDevframe().then(async (r) => {
      if (cancelled)
        return
      const scoped = r.scope(NAMESPACE)
      setCtx(scoped)
      try {
        const result = await scoped.rpc.call('demo-prompts')
        if (!cancelled)
          setDemoPrompts(result.prompts)
      }
      catch {
        // demo prompts are optional
      }
    })
    return () => {
      cancelled = true
      for (const reader of readersRef.current.values())
        reader.cancel()
      readersRef.current.clear()
    }
  }, [])

  // Bind to the server-side chat history shared state.
  useEffect(() => {
    if (!ctx)
      return
    let off: (() => void) | undefined
    let active = true
    ctx.rpc
      .sharedState(HISTORY, { initialValue: { messages: [] } })
      .then((state) => {
        if (!active)
          return
        setMessages(state.value().messages as ChatMessage[])
        off = state.on('updated', (full: ChatHistory) => {
          setMessages([...full.messages])
        })
      })
    return () => {
      active = false
      off?.()
    }
  }, [ctx])

  // For each assistant message that's currently streaming, subscribe to the
  // tokens channel and accumulate into `liveTokens`. When the server commits
  // the final content (`streamId` cleared), we drop the live overlay.
  useEffect(() => {
    if (!ctx)
      return
    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.streamId)
        continue
      if (readersRef.current.has(msg.id))
        continue

      const reader = ctx.rpc.streaming.subscribe<string>(CHANNEL, msg.streamId)
      readersRef.current.set(msg.id, reader)
      setLiveTokens(prev => ({ ...prev, [msg.id]: '' }))

      ;(async () => {
        try {
          for await (const token of reader) {
            setLiveTokens(prev => ({
              ...prev,
              [msg.id]: (prev[msg.id] ?? '') + token,
            }))
          }
        }
        catch {
          // Stream ended with error — leave whatever we accumulated.
        }
      })()
    }

    // Drop overlays for messages whose stream is now committed.
    setLiveTokens((prev) => {
      const next = { ...prev }
      let changed = false
      for (const id of Object.keys(next)) {
        const m = messages.find(x => x.id === id)
        if (!m || !m.streamId) {
          delete next[id]
          readersRef.current.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [ctx, messages])

  // Auto-scroll on new messages / live tokens.
  useEffect(() => {
    const el = messagesRef.current
    if (!el)
      return
    el.scrollTop = el.scrollHeight
  }, [messages, liveTokens])

  const activeAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'assistant' && m.streamId)
        return m.id
    }
    return undefined
  }, [messages])

  const isStreaming = !!activeAssistantId

  const send = useCallback(async (text: string) => {
    if (!ctx || isStreaming || !text.trim())
      return
    setError(null)
    setPrompt('')
    try {
      await ctx.rpc.call('send', {
        prompt: text.trim(),
      })
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [ctx, isStreaming])

  const cancel = useCallback(() => {
    if (!activeAssistantId)
      return
    const reader = readersRef.current.get(activeAssistantId)
    reader?.cancel()
  }, [activeAssistantId])

  const clear = useCallback(async () => {
    if (!ctx || isStreaming)
      return
    try {
      await ctx.rpc.call('clear')
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [ctx, isStreaming])

  if (!ctx) {
    return (
      <main class="grid h-dvh place-items-center bg-base color-base">
        <p class="flex items-center gap-2 text-sm color-muted">
          <span class={spinner()} />
          Connecting to devframe…
        </p>
      </main>
    )
  }

  return (
    <main class="flex flex-col h-dvh w-full max-w-3xl mx-auto bg-base color-base">
      <header class={nav()}>
        <span class={navBrand()}>
          <span class="i-ph-chat-circle-dots-duotone text-base color-active" />
          <span>Streaming Chat</span>
        </span>
        <span class="hidden text-xs color-muted sm:inline">
          history persists in shared state · tokens stream over a channel
        </span>
        <span class="flex-1" />
        <button
          type="button"
          class={button({ variant: 'ghost', size: 'sm' })}
          onClick={clear}
          disabled={isStreaming || messages.length === 0}
        >
          <span class="i-ph-trash" />
          Clear
        </button>
      </header>

      <div class="flex flex-1 min-h-0 flex-col gap-3 p-4">
        <div
          class="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto rounded-lg border border-base bg-base p-3"
          ref={messagesRef}
        >
          {messages.length === 0
            ? (
                <div class="m-auto max-w-xs text-center text-sm color-muted leading-relaxed">
                  <p class="mb-1 font-medium color-base">No messages yet.</p>
                  <p>
                    Type a prompt and hit
                    {' '}
                    <kbd class="rounded border border-base bg-secondary px-1.5 py-0.5 text-xs font-mono">Enter</kbd>
                    {' '}
                    — or pick a demo prompt below.
                  </p>
                </div>
              )
            : messages.map(msg => <Message key={msg.id} msg={msg} live={liveTokens[msg.id]} />)}
        </div>

        {!isStreaming && demoPrompts.length > 0 && (
          <div class="flex flex-wrap gap-2">
            {demoPrompts.map(p => (
              <button
                key={p}
                type="button"
                class={button({ variant: 'outline', size: 'sm' })}
                onClick={() => send(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <form
          class="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            send(prompt)
          }}
        >
          <input
            type="text"
            class={input('flex-1')}
            value={prompt}
            onInput={e => setPrompt((e.target as HTMLInputElement).value)}
            placeholder={isStreaming ? 'Streaming reply… cancel to send another' : 'Ask anything…'}
            disabled={isStreaming}
          />
          {isStreaming
            ? (
                <button type="button" class={button({ variant: 'destructive' })} onClick={cancel}>
                  <span class="i-ph-stop-circle-duotone" />
                  Cancel
                </button>
              )
            : (
                <button type="submit" class={button({ variant: 'primary' })} disabled={!prompt.trim()}>
                  <span class="i-ph-paper-plane-tilt" />
                  Send
                </button>
              )}
        </form>

        <div class="text-xs color-muted" data-testid="status">
          backend:
          {' '}
          <code class="font-mono color-base">{ctx.base.connectionMeta.backend}</code>
          {' · '}
          {messages.length}
          {' '}
          message
          {messages.length === 1 ? '' : 's'}
          {error && (
            <span class="text-error">
              {' · error: '}
              {error}
            </span>
          )}
        </div>
      </div>
    </main>
  )
}

function Message({ msg, live }: { msg: ChatMessage, live: string | undefined }) {
  // Prefer the live token overlay while streaming; fall back to the
  // committed content from shared state once the producer closes.
  const displayed = msg.streamId !== undefined && live !== undefined
    ? live
    : msg.content
  const cls = cx(
    'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 leading-relaxed',
    msg.role === 'user'
      ? 'self-end rounded-br-sm bg-primary-500 text-white'
      : 'self-start rounded-bl-sm bg-secondary color-base font-mono text-sm',
  )

  return (
    <div class={cls} data-role={msg.role} data-streaming={msg.streamId !== undefined ? 'true' : undefined}>
      {displayed || (msg.streamId ? '' : '(empty)')}
      {/* Live "typing" indicator while the producer is still streaming tokens. */}
      {msg.streamId && <span class={spinner('ml-1 size-3! align-[-0.2em]')} />}
      {msg.cancelled && <div class="mt-1 text-xs text-error">cancelled</div>}
    </div>
  )
}
