'use client'

import type { DevframeRpcClient } from '@devframes/hub/client'
import type {
  DevframeCommandEntry,
  DevframeDockEntry,
  DevframeMessageEntry,
  DevframeTerminalSession,
} from '@devframes/hub/types'
import { connectDevframe, createDevframeClientHost } from '@devframes/hub/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { iconClass } from './icons'

const HUB_BASE = '/__hub/'

interface Status {
  text: string
  kind?: 'ready' | 'error'
}

type IframeDock = DevframeDockEntry & { type: 'iframe', url: string }
type TerminalSummary = Pick<DevframeTerminalSession, 'id' | 'title' | 'status' | 'description'>

function isIframeDock(d: DevframeDockEntry): d is IframeDock {
  return d.type === 'iframe' && typeof (d as { url?: unknown }).url === 'string'
}

/** Render a dock icon, falling back to the title's initial when unmapped. */
function DockIcon({ entry }: { entry: DevframeDockEntry }) {
  const cls = iconClass(entry.icon)
  if (cls)
    return <span className={`${cls} shrink-0 text-lg`} />
  const initial = (entry.title?.[0] ?? '?').toUpperCase()
  return <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-active text-[0.7rem] font-bold">{initial}</span>
}

export default function Page() {
  const [status, setStatus] = useState<Status>({ text: 'Connecting...' })
  const [docks, setDocks] = useState<DevframeDockEntry[]>([])
  const [commands, setCommands] = useState<DevframeCommandEntry[]>([])
  const [messages, setMessages] = useState<DevframeMessageEntry[]>([])
  const [terminals, setTerminals] = useState<TerminalSummary[]>([])
  const [pingResult, setPingResult] = useState('Run ping')
  const [selectedDockId, setSelectedDockId] = useState<string | null>(null)
  const rpcRef = useRef<DevframeRpcClient | null>(null)

  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined

    async function run() {
      try {
        const rpc = await connectDevframe({ baseURL: HUB_BASE })
        if (cancelled)
          return

        rpcRef.current = rpc
        setStatus({ text: `Connected: backend=${rpc.connectionMeta.backend}`, kind: 'ready' })

        // Boot the framework-level client host: it builds the shared client
        // context and imports each dock's client script into this page — e.g.
        // the a11y inspector's in-page agent, which then scans this hub live.
        const clientHost = await createDevframeClientHost({ rpc })

        const docksState = await rpc.sharedState.get<DevframeDockEntry[]>(
          'devframe:docks',
          { initialValue: [] },
        )
        const commandsState = await rpc.sharedState.get<DevframeCommandEntry[]>(
          'devframe:commands',
          { initialValue: [] },
        )

        const renderDocks = () => setDocks([...(docksState.value() ?? [])] as DevframeDockEntry[])
        const renderCommands = () => setCommands([...(commandsState.value() ?? [])] as DevframeCommandEntry[])
        docksState.on('updated', renderDocks)
        commandsState.on('updated', renderCommands)
        renderDocks()
        renderCommands()

        const refreshMessages = async () => {
          const entries = await rpc.call(
            'minimal-next-devframe-hub:messages:list' as any,
          ) as DevframeMessageEntry[]
          if (!cancelled)
            setMessages(entries)
        }

        const refreshTerminals = async () => {
          const sessions = await rpc.call(
            'minimal-next-devframe-hub:terminals:list' as any,
          ) as TerminalSummary[]
          if (!cancelled)
            setTerminals(sessions)
        }

        await refreshMessages()
        await refreshTerminals()

        const interval = window.setInterval(() => {
          void refreshMessages()
          void refreshTerminals()
        }, 2000)

        cleanup = () => {
          window.clearInterval(interval)
          clientHost.dispose()
        }
      }
      catch (err) {
        if (!cancelled)
          setStatus({ text: `Failed: ${(err as Error).message}`, kind: 'error' })
      }
    }

    void run()

    return () => {
      cancelled = true
      cleanup?.()
      rpcRef.current = null
    }
  }, [])

  const iframeDocks = useMemo(() => docks.filter(isIframeDock), [docks])

  useEffect(() => {
    if (selectedDockId && !iframeDocks.some(d => d.id === selectedDockId)) {
      setSelectedDockId(null)
      return
    }
    if (!selectedDockId && iframeDocks.length > 0)
      setSelectedDockId(iframeDocks[0].id)
  }, [iframeDocks, selectedDockId])

  const selectedDock = iframeDocks.find(d => d.id === selectedDockId) ?? null

  async function ping() {
    if (!rpcRef.current)
      return
    try {
      const result = await rpcRef.current.call(
        'hub:commands:execute' as any,
        'minimal-next-devframe-hub:ping',
      )
      setPingResult(`Ping returned ${JSON.stringify(result)}`)
    }
    catch (err) {
      setPingResult(`Error: ${(err as Error).message}`)
    }
  }

  const statusDot = status.kind === 'ready' ? 'bg-success' : status.kind === 'error' ? 'bg-error' : 'bg-neutral-400'
  const titleClass = 'mb2 text-[0.68rem] uppercase tracking-wider color-muted'
  const rowClass = 'rounded-lg border border-base bg-base px2.5 py1.5 text-xs font-mono'

  return (
    <div className="h-full flex flex-col bg-base color-base">
      <header className="shrink-0 flex items-baseline gap-3 border-b border-base bg-base px4 py2.5">
        <h1 className="m0 text-sm font-semibold">Minimal Next Devframe Hub</h1>
        <p className="m0 text-xs font-mono op-fade">
          <span className={`inline-block size-1.5 rounded-full shrink-0 ${statusDot} mr-1.5 align-middle`} />
          {status.text}
        </p>
        <p className="m0 ml-auto text-xs font-mono italic color-muted">a vite-devtools-style hub on Next.js you can copy</p>
      </header>

      <div className="grid grid-cols-[244px_1fr] min-h-0 flex-1">
        <aside className="flex flex-col gap-0.5 of-auto border-r border-base bg-secondary p2">
          <h2 className="px2 py1 text-[0.68rem] uppercase tracking-wider color-muted">Docks</h2>
          <ul className="m0 flex flex-col list-none gap-0.5 p0">
            {iframeDocks.length === 0
              ? <li className="op-mute px2 text-sm">No iframe docks</li>
              : iframeDocks.map(dock => (
                  <li key={dock.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedDockId(dock.id)}
                      className={`relative inline-flex items-center gap-1.5 max-w-52 px-2 py-1 rounded-md border border-transparent text-sm op-fade select-none cursor-pointer transition hover:op100 hover:bg-active w-full! max-w-none! gap-2.5!${dock.id === selectedDockId ? ' op100! bg-active border-base! color-base' : ''}`}
                      title={dock.title}
                    >
                      <DockIcon entry={dock} />
                      <span className="truncate">{dock.title}</span>
                    </button>
                  </li>
                ))}
          </ul>
        </aside>

        <main className="min-w-0 of-hidden bg-secondary">
          <iframe
            key={selectedDock?.id ?? 'none'}
            src={selectedDock?.url ?? 'about:blank'}
            title="Selected dock"
            className="block h-full w-full border-0 bg-base"
          />
        </main>
      </div>

      <footer className="grid grid-cols-3 shrink-0 gap-5 border-t border-base bg-base px4 py3 max-h-30vh of-auto">
        <section className="min-w-0">
          <h2 className={titleClass}>Commands</h2>
          <ul className="m0 flex flex-col list-none gap-1.5 p0">
            {commands.length === 0
              ? <li className="rounded-lg border border-base bg-base border-dashed px2.5 py1.5 text-xs font-mono op-mute">Waiting for snapshot…</li>
              : commands.map(command => (
                  <li key={command.id} className={rowClass}>
                    {command.title}
                    {' '}
                    <code className="op-fade">{command.id}</code>
                  </li>
                ))}
          </ul>
          <div className="mt2.5">
            <button type="button" onClick={() => void ping()} className="btn-action text-sm">
              {pingResult}
            </button>
          </div>
        </section>

        <section className="min-w-0">
          <h2 className={titleClass}>Messages</h2>
          <ul className="m0 flex flex-col list-none gap-1.5 p0">
            {messages.length === 0
              ? <li className="rounded-lg border border-base bg-base border-dashed px2.5 py1.5 text-xs font-mono op-mute">No messages yet.</li>
              : messages.map(message => (
                  <li key={message.id} className={rowClass}>
                    <span className="op-fade">
                      [
                      {message.level}
                      ]
                    </span>
                    {' '}
                    {message.message}
                  </li>
                ))}
          </ul>
        </section>

        <section className="min-w-0">
          <h2 className={titleClass}>Terminals</h2>
          <ul className="m0 flex flex-col list-none gap-1.5 p0">
            {terminals.length === 0
              ? <li className="rounded-lg border border-base bg-base border-dashed px2.5 py1.5 text-xs font-mono op-mute">No terminal sessions.</li>
              : terminals.map(terminal => (
                  <li key={terminal.id} className={rowClass}>
                    {terminal.title}
                    {' '}
                    <code className="op-fade">{terminal.id}</code>
                    {' '}
                    ·
                    {' '}
                    {terminal.status}
                  </li>
                ))}
          </ul>
        </section>
      </footer>
    </div>
  )
}
