import type { DevframeScopedClientContext } from 'devframe/client'
import type { StreamReader } from 'devframe/utils/streaming-channel'
import type { ChatHistory, ChatMessage } from '../types'
import { connectDevframe } from 'devframe/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { CHANNEL, HISTORY, NAMESPACE } from '../constants'

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

  if (!ctx)
    return <main><p>Connecting to devframe…</p></main>

  return (
    <main>
      <header>
        <div>
          <h1>Streaming Chat</h1>
          <small>history persists in shared state · tokens stream over a channel</small>
        </div>
        <div class="toolbar">
          <button
            type="button"
            onClick={clear}
            disabled={isStreaming || messages.length === 0}
          >
            Clear
          </button>
        </div>
      </header>

      <div class="messages" ref={messagesRef}>
        {messages.length === 0
          ? (
              <div class="empty">
                <p>No messages yet.</p>
                <p>
                  Type a prompt and hit
                  {' '}
                  <kbd>Enter</kbd>
                  {' '}
                  — or pick a demo prompt below.
                </p>
              </div>
            )
          : messages.map(msg => <Message key={msg.id} msg={msg} live={liveTokens[msg.id]} />)}
      </div>

      {!isStreaming && demoPrompts.length > 0 && (
        <div class="demo-prompts">
          {demoPrompts.map(p => (
            <button key={p} type="button" onClick={() => send(p)}>{p}</button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(prompt)
        }}
      >
        <input
          type="text"
          value={prompt}
          onInput={e => setPrompt((e.target as HTMLInputElement).value)}
          placeholder={isStreaming ? 'Streaming reply… cancel to send another' : 'Ask anything…'}
          disabled={isStreaming}
        />
        {isStreaming
          ? <button type="button" class="cancel" onClick={cancel}>Cancel</button>
          : <button type="submit" class="send" disabled={!prompt.trim()}>Send</button>}
      </form>

      <div class="status">
        backend:
        {' '}
        <code>{ctx.base.connectionMeta.backend}</code>
        {' · '}
        {messages.length}
        {' '}
        message
        {messages.length === 1 ? '' : 's'}
        {error && (
          <span class="err">
            {' · error: '}
            {error}
          </span>
        )}
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
  const cls = [
    'msg',
    `msg-${msg.role}`,
    msg.streamId ? 'streaming' : '',
    msg.cancelled ? 'cancelled' : '',
  ].filter(Boolean).join(' ')

  return (
    <div class={cls}>
      {displayed || (msg.streamId ? '' : '(empty)')}
      {msg.cancelled && <div class="msg-meta">cancelled</div>}
    </div>
  )
}
