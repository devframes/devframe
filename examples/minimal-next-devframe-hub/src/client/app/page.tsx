'use client'

import type { DevframeRpcClient } from '@devframes/hub/client'
import type {
  DevframeCommandEntry,
  DevframeDockEntry,
  DevframeMessageEntry,
  DevframeTerminalSession,
  DevframeViewIframe,
} from '@devframes/hub/types'
import type { DevframeJsonRenderSpec } from '@devframes/json-render'
import type { DevframeJsonRenderDockEntry } from '@devframes/json-render/hub'
import { connectDevframe, createDevframeClientHost, FRAME_NAV_CHANNEL } from '@devframes/hub/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createReactJsonRenderDockRenderer } from '../json-render/dock-renderer'
import { iconClass } from './icons'

const HUB_BASE = '/__hub/'

interface Status {
  text: string
  kind?: 'ready' | 'error'
}

type IframeDock = DevframeDockEntry & { type: 'iframe', url: string }
type TerminalSummary = Pick<DevframeTerminalSession, 'id' | 'title' | 'status' | 'description'>
type ClientHost = Awaited<ReturnType<typeof createDevframeClientHost>>

function isIframeDock(d: DevframeDockEntry): d is IframeDock {
  return d.type === 'iframe' && typeof (d as { url?: unknown }).url === 'string'
}

// A dock this shell can display: an iframe, or one with a registered renderer
// (the json-render dock, rendered by the mini React registry).
const RENDERER_TYPES = new Set(['json-render'])
function isRenderableDock(d: DevframeDockEntry): boolean {
  return isIframeDock(d) || RENDERER_TYPES.has(d.type)
}

// One iframe is kept alive per `frameId` (shared-frame docks) or per dock id
// (plain iframe docks), so shared-frame member docks reuse the same element and
// soft-navigate rather than reload.
function frameKeyOf(e: DevframeDockEntry): string {
  return (e as DevframeViewIframe).frameId ?? e.id
}

// A self-contained document for the client-only dock, rendered from a Blob URL
// so the whole dock is synthesized in the browser with no server route.
function createClientNotesUrl(): string {
  const html = `<!doctype html><meta charset="utf-8">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 14px/1.6 system-ui, sans-serif; }
  h1 { margin: 0 0 8px; font-size: 16px; }
  p { max-width: 54ch; opacity: .85; }
  code { padding: 1px 5px; border-radius: 4px; background: rgba(127,127,127,.18); font-size: 12px; }
</style>
<h1>Client-only dock</h1>
<p>This dock was registered in the browser with
  <code>host.context.docks.register()</code>. It lives only in this page — it
  never enters the <code>devframe:docks</code> shared state, so it is not synced
  to the hub server or to any other connected viewer.</p>
<p>Patch it live through the returned handle with <code>update()</code> (its
  <code>badge</code> was set that way), or remove it with <code>dispose()</code>.</p>`
  return URL.createObjectURL(new Blob([html], { type: 'text/html' }))
}

// An *interactive* json-render spec synthesized entirely in the browser — the
// client-only counterpart to a server-authored view. Interactivity needs no
// server and no shared state: `{ $bindState }` inputs write straight into the
// view's own `state`, `{ $state }` reads mirror it live, and the buttons use the
// framework's built-in state actions (`pushState` / `setState`) to mutate that
// state — every change re-renders through the mini React registry.
function createClientPlaygroundSpec(clientType: string): DevframeJsonRenderSpec {
  return {
    root: 'root',
    elements: {
      root: { type: 'Stack', props: { gap: 14 }, children: ['head', 'hello', 'notes', 'env'] },

      head: { type: 'Stack', props: { direction: 'row', gap: 8, align: 'center' }, children: ['icon', 'title', 'badge'] },
      icon: { type: 'Icon', props: { name: 'ph:sliders-horizontal-duotone', size: 22 }, children: [] },
      title: { type: 'Text', props: { text: 'Client Playground', variant: 'heading' }, children: [] },
      badge: { type: 'Badge', props: { text: 'client-only', variant: 'info' }, children: [] },

      // ── Two-way binding: type a name, see it echoed live; toggle a switch ──
      hello: { type: 'Card', props: { title: 'Say hello' }, children: ['helloBody'] },
      helloBody: { type: 'Stack', props: { gap: 10 }, children: ['nameInput', 'greetRow', 'compact'] },
      nameInput: { type: 'TextInput', props: { label: 'Your name', placeholder: 'Type your name…', value: { $bindState: '/form/name' } }, children: [] },
      greetRow: { type: 'Stack', props: { direction: 'row', gap: 6, align: 'center' }, children: ['greetLabel', 'greetName'] },
      greetLabel: { type: 'Text', props: { text: 'Hello,', variant: 'body', color: 'muted' }, children: [] },
      greetName: { type: 'Text', props: { text: { $state: '/form/name' }, variant: 'body', color: 'primary' }, children: [] },
      compact: { type: 'Switch', props: { label: 'Compact mode', value: { $bindState: '/prefs/compact' } }, children: [] },

      // ── Actions mutate state → the DataTable re-renders ──
      notes: { type: 'Card', props: { title: 'Notes' }, children: ['notesBody'] },
      notesBody: { type: 'Stack', props: { gap: 10 }, children: ['draftRow', 'notesTable', 'clearBtn'] },
      draftRow: { type: 'Stack', props: { direction: 'row', gap: 8, align: 'end' }, children: ['draftInput', 'addBtn'] },
      draftInput: { type: 'TextInput', props: { label: 'New note', placeholder: 'Write something…', value: { $bindState: '/draft' } }, children: [] },
      addBtn: {
        type: 'Button',
        props: { label: 'Add', variant: 'primary', icon: 'ph:plus' },
        // Built-in `pushState`: append the typed draft to /notes, then clear the input.
        on: { press: { action: 'pushState', params: { statePath: '/notes', value: { text: { $state: '/draft' } }, clearStatePath: '/draft' } } },
        children: [],
      },
      notesTable: {
        type: 'DataTable',
        props: { columns: [{ key: 'text', label: 'Note' }], rows: { $state: '/notes' }, height: 160 },
        children: [],
      },
      clearBtn: {
        type: 'Button',
        props: { label: 'Clear all', variant: 'ghost', icon: 'ph:trash' },
        // Built-in `setState`: replace /notes with an empty array.
        on: { press: { action: 'setState', params: { statePath: '/notes', value: [] } } },
        children: [],
      },

      env: { type: 'Card', props: { title: 'Environment', collapsible: true, defaultCollapsed: true }, children: ['envTable'] },
      envTable: {
        type: 'KeyValueTable',
        props: {
          data: {
            clientType,
            language: navigator.language,
            viewport: `${window.innerWidth}×${window.innerHeight}`,
          },
        },
        children: [],
      },
    },
    state: {
      form: { name: '' },
      prefs: { compact: false },
      draft: '',
      notes: [{ text: 'Authored entirely in the browser' }],
    },
  }
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
  const hostRef = useRef<ClientHost | null>(null)
  // The stage holds the kept-alive iframe pool; the panel hosts renderer docks.
  const stageRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const iframePoolRef = useRef<Map<string, HTMLIFrameElement>>(new Map())
  const rendererMountRef = useRef<{ id: string, dispose: () => void } | null>(null)
  const wiredRef = useRef<Set<string>>(new Set())

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
        //
        // Register a mini React json-render renderer so the hub can display the
        // `json-render` dock authored server-side via @devframes/json-render.
        const clientHost = await createDevframeClientHost({
          rpc,
          renderers: { 'json-render': createReactJsonRenderDockRenderer() },
        })
        hostRef.current = clientHost
        const ctx = clientHost.context

        // Register a *client-only* dock — one this page synthesizes itself.
        // Unlike the server-authored docks, it's registered on the client host
        // context, so it never enters the `devframe:docks` shared state: it
        // stays local to this page and is not synced to the hub server or other
        // viewers. It merges into `ctx.docks.entries` alongside the server
        // docks. `force` lets React StrictMode re-run this effect without
        // tripping the duplicate-id guard.
        const clientDock = ctx.docks.register<DevframeViewIframe>({
          id: 'client-notes',
          title: 'Client Notes',
          icon: 'ph:note-pencil-duotone',
          type: 'iframe',
          url: createClientNotesUrl(),
          category: 'app',
        }, true)
        // Patch it in place with the returned handle (the id is immutable).
        clientDock.update({ badge: ctx.clientType })

        // Register a second client-only dock — this one a *json-render* view the
        // page authors itself, the richer sibling of the iframe dock above. Its
        // spec is carried **inline** in the dock entry (`view.spec`), so it needs
        // no shared state at all: it lives only in this page yet renders — and
        // stays fully interactive (inputs, toggles, and buttons that mutate its
        // state) — through the same `json-render` dock renderer (the mini React
        // registry) as a server-authored view. `force` lets React StrictMode
        // re-run this effect safely.
        const clientJsonRenderDock = clientHost.context.docks.register<DevframeJsonRenderDockEntry>({
          id: 'client-playground',
          title: 'Client Playground',
          icon: 'ph:sliders-horizontal-duotone',
          type: 'json-render',
          view: { spec: createClientPlaygroundSpec(clientHost.context.clientType) },
          category: 'app',
        }, true)

        const docksState = await rpc.sharedState.get<DevframeDockEntry[]>(
          'devframe:docks',
          { initialValue: [] },
        )
        const commandsState = await rpc.sharedState.get<DevframeCommandEntry[]>(
          'devframe:commands',
          { initialValue: [] },
        )

        // Mirror the merged dock list (server docks + client-only docks) and the
        // host's current selection into React state. Selection is owned by the
        // client host (`switchEntry`) — that is what lets the frame-nav adapter
        // hear a dock's `entry:activated` and drive shared-frame soft-navigation.
        const syncDocks = () => setDocks([...ctx.docks.entries])
        const syncSelected = () => setSelectedDockId(ctx.docks.selectedId)
        const renderCommands = () => setCommands([...(commandsState.value() ?? [])] as DevframeCommandEntry[])
        docksState.on('updated', syncDocks)
        commandsState.on('updated', renderCommands)
        syncDocks()
        syncSelected()
        renderCommands()

        // The frame-nav adapter registers/updates client-only member docks in
        // response to a shared-frame anchor's manifest; re-sync (after it has
        // reconciled, hence the microtask) so those docks appear in the list.
        const onMessage = (event: MessageEvent) => {
          const data = event.data as { channel?: string, from?: string } | undefined
          if (data?.channel === FRAME_NAV_CHANNEL && data.from === 'frame') {
            queueMicrotask(() => {
              syncDocks()
              syncSelected()
            })
          }
        }
        window.addEventListener('message', onMessage)

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
          window.removeEventListener('message', onMessage)
          // Remove the client-only docks, then tear down the host + local DOM.
          clientDock.dispose()
          clientJsonRenderDock.dispose()
          clientHost.dispose()
          wiredRef.current.clear()
          for (const el of iframePoolRef.current.values()) el.remove()
          iframePoolRef.current.clear()
          rendererMountRef.current?.dispose()
          rendererMountRef.current = null
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

  const renderableDocks = useMemo(() => docks.filter(isRenderableDock), [docks])

  // Wire each dock's state once so a selection change — from a click, or from
  // the frame-nav adapter reacting to in-frame navigation — updates the UI.
  useEffect(() => {
    const ctx = hostRef.current?.context
    if (!ctx)
      return
    for (const entry of docks) {
      if (wiredRef.current.has(entry.id))
        continue
      const state = ctx.docks.getStateById(entry.id)
      if (!state)
        continue
      wiredRef.current.add(entry.id)
      state.events.on('entry:activated', () => setSelectedDockId(ctx.docks.selectedId))
    }
  }, [docks])

  // Drive selection through the client host, and auto-select the first dock.
  useEffect(() => {
    const ctx = hostRef.current?.context
    if (!ctx)
      return
    if (!selectedDockId && renderableDocks.length > 0)
      void ctx.docks.switchEntry(renderableDocks[0].id)
  }, [renderableDocks, selectedDockId])

  const selectedDock = renderableDocks.find(d => d.id === selectedDockId) ?? null
  const selectedIsIframe = selectedDock ? isIframeDock(selectedDock) : false

  // Keep-alive iframe pool: ensure + show the iframe for the selected dock's
  // frame, hide the rest. Creating an iframe hands it to the client host
  // (`domElements.iframe` + `dom:iframe:mounted`) so the frame-nav adapter can
  // attach to a `subTabs` anchor (plan §6.2).
  useEffect(() => {
    const ctx = hostRef.current?.context
    const stage = stageRef.current
    if (!ctx || !stage)
      return
    const pool = iframePoolRef.current

    if (selectedDock && isIframeDock(selectedDock)) {
      const key = frameKeyOf(selectedDock)
      let el = pool.get(key)
      if (!el) {
        el = document.createElement('iframe')
        el.title = selectedDock.title
        el.className = 'absolute inset-0 block h-full w-full border-0 bg-base'
        el.src = selectedDock.url
        stage.appendChild(el)
        pool.set(key, el)
        const state = ctx.docks.getStateById(selectedDock.id)
        if (state) {
          state.domElements.iframe = el
          state.events.emit('dom:iframe:mounted', el)
        }
      }
      for (const other of pool.values()) other.hidden = other !== el
    }
    else {
      for (const other of pool.values()) other.hidden = true
    }
  }, [selectedDockId, docks, selectedDock])

  // Mount a renderer dock (json-render) into the panel via the client host's
  // renderer registry, disposing when the selection changes.
  useEffect(() => {
    const host = hostRef.current
    const dock = selectedDock
    const container = panelRef.current
    if (!host || !dock || isIframeDock(dock) || !container)
      return
    let alive = true
    let dispose: (() => void) | undefined
    void host.context.renderers.mount(dock, container).then((d) => {
      if (alive)
        dispose = d
      else d()
    })
    return () => {
      alive = false
      dispose?.()
    }
  }, [selectedDockId, selectedIsIframe])

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
      <header className="shrink-0 flex items-center gap-3 h-nav px-3 border-b border-base bg-base">
        <h1 className="m0 flex items-center gap-1.5 shrink-0 text-sm font-semibold select-none">
          <span className="i-ph-squares-four-duotone text-base color-active" />
          <span>Minimal Next Devframe Hub</span>
        </h1>
        <p className="m0 text-xs font-mono op-fade">
          <span className={`inline-block size-1.5 rounded-full shrink-0 ${statusDot} mr-1.5 align-middle`} />
          {status.text}
        </p>
      </header>

      <div className="grid grid-cols-[244px_1fr] min-h-0 flex-1">
        <aside className="flex flex-col gap-0.5 of-auto border-r border-base bg-secondary p2">
          <h2 className="px2 py1 text-[0.68rem] uppercase tracking-wider color-muted">Docks</h2>
          <ul className="m0 flex flex-col list-none gap-0.5 p0">
            {renderableDocks.length === 0
              ? <li className="op-mute px2 text-sm">No docks</li>
              : renderableDocks.map(dock => (
                  <li key={dock.id}>
                    <button
                      type="button"
                      onClick={() => void hostRef.current?.context.docks.switchEntry(dock.id)}
                      className={`relative inline-flex items-center gap-1.5 max-w-52 px-2 py-1 rounded-md border border-transparent text-sm op-fade select-none cursor-pointer transition hover:op100 hover:bg-active w-full! max-w-none! gap-2.5!${dock.id === selectedDockId ? ' op100! bg-active border-base! color-base' : ''}`}
                      title={dock.title}
                    >
                      <DockIcon entry={dock} />
                      <span className="truncate">{dock.title}</span>
                      {dock.badge && <span className="ml-auto shrink-0 rounded bg-active px1 py0.5 text-[0.6rem] font-mono color-base">{dock.badge}</span>}
                    </button>
                  </li>
                ))}
          </ul>
        </aside>

        <main className="relative min-w-0 of-hidden bg-secondary">
          {/* Iframe docks are pooled here (one kept-alive iframe per frameId),
              shown/hidden on switch so shared-frame tabs soft-navigate. */}
          <div ref={stageRef} hidden={!selectedDock || !selectedIsIframe} className="absolute inset-0" />
          {/* Renderer docks (json-render) mount here via the client host. */}
          <div ref={panelRef} hidden={!selectedDock || selectedIsIframe} className="absolute inset-0 of-auto bg-base p4" />
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
