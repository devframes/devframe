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
import { useEffect, useRef, useState } from 'react'

const HUB_BASE = '/__hub/'

interface Status {
  text: string
  kind?: 'ready' | 'error'
}

type TerminalSummary = Pick<DevframeTerminalSession, 'id' | 'title' | 'status' | 'description'>

export default function Page() {
  const [status, setStatus] = useState<Status>({ text: 'Connecting...' })
  const [docks, setDocks] = useState<DevframeDockEntry[]>([])
  const [commands, setCommands] = useState<DevframeCommandEntry[]>([])
  const [messages, setMessages] = useState<DevframeMessageEntry[]>([])
  const [terminals, setTerminals] = useState<TerminalSummary[]>([])
  const [openPathResult, setOpenPathResult] = useState('Test hub:open-path on this README')
  const [pingResult, setPingResult] = useState('Run ping')
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

  async function openReadme() {
    if (!rpcRef.current)
      return
    try {
      const result = await rpcRef.current.call(
        'hub:commands:execute' as any,
        'hub:open-path',
        'README.md',
      )
      setOpenPathResult(`Opened: ${JSON.stringify(result)}`)
    }
    catch (err) {
      setOpenPathResult(`Error: ${(err as Error).message}`)
    }
  }

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
    <main>
      <header>
        <h1>Minimal Next Devframe Hub</h1>
        <p>
          Protocol witness: verifies
          {' '}
          <code>@devframes/hub</code>
          {' '}
          end to end from a Next.js host.
        </p>
      </header>

      <section id="status" className={status.kind ?? ''}>
        <span>{status.text}</span>
      </section>

      <Panel title="Docks" empty="Waiting for snapshot...">
        {docks.map(dock => (
          <li key={dock.id}>
            <strong>{dock.title}</strong>
            {' '}
            <code>{dock.id}</code>
            {'badge' in dock && dock.badge
              ? <span className="badge">{`[${dock.badge}]`}</span>
              : null}
          </li>
        ))}
      </Panel>

      <Panel title="Commands" empty="Waiting for snapshot...">
        {commands.map(command => (
          <li key={command.id}>
            <strong>{command.title}</strong>
            {' '}
            <code>{command.id}</code>
          </li>
        ))}
      </Panel>

      <div className="actions">
        <button type="button" onClick={() => void openReadme()}>
          {openPathResult}
        </button>
        <button type="button" onClick={() => void ping()}>
          {pingResult}
        </button>
      </div>

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
    </main>
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
