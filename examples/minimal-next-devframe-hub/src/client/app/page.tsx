'use client'

import type { DevframeRpcClient } from '@devframes/hub/client'
import type {
  DevframeCommandEntry,
  DevframeDockEntry,
  DevframeMessageEntry,
  DevframeTerminalSession,
} from '@devframes/hub/types'
import type { ReactNode } from 'react'
import { connectDevframe } from '@devframes/hub/client'
import { useEffect, useMemo, useRef, useState } from 'react'

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

        const docksState = await rpc.sharedState.get<DevframeDockEntry[]>(
          'devframe:docks',
          { initialValue: [] },
        )
        const commandsState = await rpc.sharedState.get<DevframeCommandEntry[]>(
          'devframe:commands',
          { initialValue: [] },
        )

        const renderDocks = () => setDocks(docksState.value() ?? [])
        const renderCommands = () => setCommands(commandsState.value() ?? [])
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

        cleanup = () => window.clearInterval(interval)
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Minimal Next Devframe Hub</h1>
        <p id="status" className={status.kind ?? ''}>
          <span>{status.text}</span>
        </p>
      </header>

      <aside className="app-sidebar">
        <h2>Docks</h2>
        <ul>
          {iframeDocks.length === 0
            ? <li className="muted">No iframe docks</li>
            : iframeDocks.map(dock => (
                <li key={dock.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedDockId(dock.id)}
                    className={dock.id === selectedDockId ? 'active' : ''}
                  >
                    {dock.title}
                  </button>
                </li>
              ))}
        </ul>
      </aside>

      <main className="app-main">
        <iframe
          key={selectedDock?.id ?? 'none'}
          src={selectedDock?.url ?? 'about:blank'}
          title="Selected dock"
        />
      </main>

      <footer className="app-footer">
        <Panel title="Commands" empty="Waiting for snapshot...">
          {commands.map(command => (
            <li key={command.id}>
              <strong>{command.title}</strong>
              {' '}
              <code>{command.id}</code>
            </li>
          ))}
        </Panel>
        <Panel title="Messages" empty="No messages yet.">
          {messages.map(message => (
            <li key={message.id}>
              <strong>{`[${message.level}]`}</strong>
              {' '}
              {message.message}
            </li>
          ))}
        </Panel>
        <Panel title="Terminals" empty="No terminal sessions.">
          {terminals.map(terminal => (
            <li key={terminal.id}>
              <strong>{terminal.title}</strong>
              {' '}
              <code>{terminal.id}</code>
              {' '}
              {terminal.status}
            </li>
          ))}
        </Panel>
        <div className="actions">
          <button type="button" onClick={() => void ping()}>
            {pingResult}
          </button>
        </div>
      </footer>
    </div>
  )
}

function Panel({ title, empty, children }: {
  title: string
  empty: string
  children: ReactNode
}) {
  const items = Array.isArray(children) ? children : [children]
  return (
    <section>
      <h2>{title}</h2>
      <ul>{items.length ? children : <li className="muted">{empty}</li>}</ul>
    </section>
  )
}
