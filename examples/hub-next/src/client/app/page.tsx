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
import type { FormEvent } from 'react'
import { connectDevframe, createDevframeClientHost, FRAME_NAV_CHANNEL } from '@devframes/hub/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createReactJsonRenderDockRenderer } from '../json-render/react-renderer'
import { dockIconSvg } from './icons'

const HUB_BASE = '/__devframes/'

// ── transport preference (`?transport=` param) ──────────────────────────────
// The hub serves both live transports (WS at `__ws`, SSE at `__sse`); the
// client's `transport` option picks one, `auto` trusting the server's
// advertisement. A connected client has no live switch, so the toggle writes
// the `?transport=` param and reloads to reconnect on the pinned transport.
const TRANSPORT_PREFS = ['auto', 'websocket', 'sse'] as const
type TransportPref = (typeof TRANSPORT_PREFS)[number]

function readTransportPref(): TransportPref {
  const raw = new URLSearchParams(window.location.search).get('transport')
  return (TRANSPORT_PREFS as readonly string[]).includes(raw ?? '') ? raw as TransportPref : 'auto'
}
function applyTransportPref(pref: TransportPref): void {
  const url = new URL(window.location.href)
  if (pref === 'auto')
    url.searchParams.delete('transport')
  else
    url.searchParams.set('transport', pref)
  window.location.href = url.href
}
function transportLabel(pref: TransportPref): string {
  return pref === 'websocket' ? 'WS' : pref === 'sse' ? 'SSE' : 'Auto'
}

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

// Dock types this shell renders natively (or that carry no panel view of
// their own). Everything else routes through the hub's dock-renderer
// registry - the local React renderer registered at boot, or a prebuilt
// module from the hub's renderer manifest - and a type nothing covers shows
// the missing-renderer fallback.
const NATIVE_TYPES = new Set(['action', 'launcher', 'group', '~builtin'])
function isRenderableDock(d: DevframeDockEntry): boolean {
  return isIframeDock(d) || !NATIVE_TYPES.has(d.type)
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
  <code>host.context.docks.register()</code>. It lives only in this page - it
  never enters the <code>devframe:docks</code> shared state, so it is not synced
  to the hub server or to any other connected viewer.</p>
<p>Patch it live through the returned handle with <code>update()</code> (its
  <code>badge</code> was set that way), or remove it with <code>dispose()</code>.</p>`
  return URL.createObjectURL(new Blob([html], { type: 'text/html' }))
}

// An *interactive* json-render spec synthesized entirely in the browser - the
// client-only counterpart to a server-authored view. Interactivity needs no
// server and no shared state: `{ $bindState }` inputs write straight into the
// view's own `state`, `{ $state }` reads mirror it live, and the buttons use the
// framework's built-in state actions (`pushState` / `setState`) to mutate that
// state - every change re-renders through the mini React registry.
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

type ClientContext = ClientHost['context']

// Register the two *client-only* docks (an iframe from a Blob URL + an inline
// interactive json-render view) on the client host context, so they stay local
// to this page and never enter `devframe:docks` shared state. `force` lets
// React StrictMode re-run the boot effect without tripping the duplicate-id
// guard. Returns a disposer that removes them again.
function registerClientDocks(ctx: ClientContext): () => void {
  const notes = ctx.docks.register<DevframeViewIframe>({
    id: 'client-notes',
    title: 'Client Notes',
    icon: 'ph:note-pencil-duotone',
    type: 'iframe',
    url: createClientNotesUrl(),
    category: 'app',
  }, true)
  notes.update({ badge: ctx.clientType }) // patch in place via the handle
  const playground = ctx.docks.register<DevframeJsonRenderDockEntry>({
    id: 'client-playground',
    title: 'Client Playground',
    icon: 'ph:sliders-horizontal-duotone',
    type: 'json-render',
    view: { spec: createClientPlaygroundSpec(ctx.clientType) },
    category: 'app',
  }, true)
  return () => {
    notes.dispose()
    playground.dispose()
  }
}

// Poll the two kit-local RPCs that expose the hub's message + terminal
// subsystems (a fuller kit would push over the hub's `*:updated` broadcasts).
// Returns a stop function that ends the polling.
function pollDrawer(
  rpc: DevframeRpcClient,
  onMessages: (m: DevframeMessageEntry[]) => void,
  onTerminals: (t: TerminalSummary[]) => void,
): () => void {
  let alive = true
  const refresh = async (): Promise<void> => {
    const [messages, terminals] = await Promise.all([
      rpc.call('example:next-devframe-hub:messages:list' as any) as Promise<DevframeMessageEntry[]>,
      rpc.call('example:next-devframe-hub:terminals:list' as any) as Promise<TerminalSummary[]>,
    ])
    if (alive) {
      onMessages(messages)
      onTerminals(terminals)
    }
  }
  void refresh()
  const interval = window.setInterval(() => void refresh(), 2000)
  return () => {
    alive = false
    window.clearInterval(interval)
  }
}

/** Fetches (and caches, for the component's lifetime) a dock icon's sanitized SVG. */
function useDockIconSvg(icon: DevframeDockEntry['icon']): string | undefined {
  const [svg, setSvg] = useState<string | undefined>(undefined)
  const key = typeof icon === 'string' ? icon : icon?.light

  useEffect(() => {
    let cancelled = false
    setSvg(undefined)
    void dockIconSvg(icon).then((resolved) => {
      if (!cancelled)
        setSvg(resolved)
    })
    return () => {
      cancelled = true
    }
    // Re-fetch only when the icon id itself changes, not on every `icon` object identity.
  }, [key])

  return svg
}

/** Render a dock icon, falling back to the title's initial while it loads or when unmapped. */
function DockIcon({ entry }: { entry: DevframeDockEntry }) {
  const svg = useDockIconSvg(entry.icon)
  if (svg)
    return <span className="h-5 w-5 shrink-0 text-lg" dangerouslySetInnerHTML={{ __html: svg }} />
  const initial = (entry.title?.[0] ?? '?').toUpperCase()
  return <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-active text-[0.7rem] font-bold">{initial}</span>
}

// ── authorization gate (interactive OTP) ────────────────────────────────────
// The hub gates every connection; this shell opts out of devframe's native
// `prompt()` (`simpleAuth: false`) and renders its own authorization view,
// mirroring the reference UI's `ViewBuiltinClientAuthNotice`. It shows only
// once the handshake is refused — a stored token or the magic-link OTP
// authorizes silently and this never mounts.
function AuthOverlay({ rpc }: { rpc: DevframeRpcClient }) {
  const CODE_LENGTH = 6
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (code.length < CODE_LENGTH || verifying)
      return
    setVerifying(true)
    setError('')
    try {
      const ok = await rpc.requestTrustWithCode(code)
      if (!ok) {
        setError('That code didn’t match. Check your terminal and try again.')
        setCode('')
        inputRef.current?.focus()
      }
      // On success the boot effect's trust listener unmounts this overlay.
    }
    catch {
      setError('Something went wrong while authorizing. Please try again.')
    }
    finally {
      setVerifying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-modal-content grid place-items-center of-auto bg-base p8 color-base">
      <div className="w-full max-w-100 flex flex-col items-center text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-active">
          <span className="i-ph-shield-check-duotone text-4xl color-active" />
        </div>
        <h1 className="mt5 text-2xl font-bold tracking-tight">Authorize Next Devframe Hub</h1>
        <p className="mt2 max-w-88 text-sm op-fade leading-relaxed">
          This hub can access your server, read your filesystem, and run commands.
          Confirm it&apos;s you before continuing.
        </p>
        <form onSubmit={submit} className="mt6 w-full flex flex-col items-center gap-4 rounded-xl border border-base bg-secondary p6 shadow-sm" autoComplete="off">
          <p className="text-sm op-fade">
            Enter the
            {' '}
            <span className="font-mono color-active">6-digit code</span>
            {' '}
            printed in your terminal.
          </p>
          <input
            ref={inputRef}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            aria-label="One-time authorization code"
            placeholder="••••••"
            className="w-56 rounded-lg border border-base bg-base px3 py2 text-center text-2xl font-mono tracking-[0.4em] color-base outline-none focus:border-active"
          />
          <button type="submit" disabled={code.length < CODE_LENGTH || verifying} className="btn-primary w-full justify-center py2!">
            {verifying ? 'Authorizing…' : 'Authorize'}
          </button>
          <p className="min-h-5 text-sm text-red-500" role="alert" aria-live="assertive">{error}</p>
        </form>
      </div>
    </div>
  )
}

export default function Page() {
  const [status, setStatus] = useState<Status>({ text: 'Connecting...' })
  const [authNeeded, setAuthNeeded] = useState(false)
  const [transport, setTransport] = useState<string | null>(null)
  const [transportPref, setTransportPref] = useState<TransportPref>('auto')
  const [docks, setDocks] = useState<DevframeDockEntry[]>([])
  const [commands, setCommands] = useState<DevframeCommandEntry[]>([])
  const [messages, setMessages] = useState<DevframeMessageEntry[]>([])
  const [terminals, setTerminals] = useState<TerminalSummary[]>([])
  const [pingResult, setPingResult] = useState('Run ping')
  const [selectedDockId, setSelectedDockId] = useState<string | null>(null)
  // Fallback shown when the selected renderer dock's type has no renderer
  // (missing-renderer) or its manifest module failed to import (load-error).
  const [panelFallback, setPanelFallback] = useState<{ message: string, hint: string } | null>(null)
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
    let offAuth: (() => void) | undefined

    async function run() {
      try {
        const pref = readTransportPref()
        setTransportPref(pref)
        // The hub gates by default (interactive OTP). `simpleAuth: false` opts
        // out of devframe's native `prompt()` so this shell drives its own
        // authorization view; the magic-link OTP (`?devframe_otp=`) is still
        // consumed automatically. `connectDevframe` resolves before the trust
        // handshake settles, so hold the client-host boot until trusted.
        const rpc = await connectDevframe({ baseURL: HUB_BASE, transport: pref, simpleAuth: false })
        if (cancelled)
          return

        rpcRef.current = rpc
        setTransport(rpc.transport)

        // Gate on trust. A stored token or the magic link resolves silently
        // (the overlay never shows); otherwise the connection settles
        // `unauthorized` and the overlay collects the code the user types.
        if (!rpc.isTrusted) {
          await new Promise<void>((resolve) => {
            const offTrust = rpc.events.on('rpc:is-trusted:updated', (trusted) => {
              if (trusted) {
                offAuth?.()
                resolve()
              }
            })
            const reveal = (status: string): void => {
              if (status === 'unauthorized')
                setAuthNeeded(true)
            }
            const offStatus = rpc.events.on('connection:status', reveal)
            offAuth = () => {
              offTrust()
              offStatus()
            }
            reveal(rpc.status)
          })
          if (cancelled)
            return
          setAuthNeeded(false)
        }

        setStatus({ text: `Connected: transport=${rpc.transport}`, kind: 'ready' })

        // Boot the framework-level client host: it builds the shared client
        // context and imports each dock's client script into this page - e.g.
        // the a11y inspector's in-page agent, which then scans this hub live.
        //
        // Register a mini React json-render renderer. The hub also publishes
        // the reference Vue frontend through its renderer manifest
        // (`initHub({ renderers: [jsonRenderUiRenderer()] })`), but a locally
        // registered renderer takes precedence - witnessing that any frontend
        // implementing the `JsonRenderDockRenderer` contract can replace the
        // reference one. Delete this `renderers` option and the same dock
        // renders through the manifest-served Vue module instead.
        const clientHost = await createDevframeClientHost({
          rpc,
          renderers: { 'json-render': createReactJsonRenderDockRenderer() },
        })
        hostRef.current = clientHost
        const ctx = clientHost.context

        // Two *client-only* docks (an iframe + an interactive inline
        // json-render view), local to this page - never entering
        // `devframe:docks` shared state, merged into `ctx.docks.entries`.
        const disposeClientDocks = registerClientDocks(ctx)

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
        // client host (`switchEntry`) - that is what lets the frame-nav adapter
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

        const stopPolling = pollDrawer(rpc, setMessages, setTerminals)

        cleanup = () => {
          stopPolling()
          window.removeEventListener('message', onMessage)
          // Remove the client-only docks, then tear down the host + local DOM.
          disposeClientDocks()
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
      offAuth?.()
      cleanup?.()
      rpcRef.current = null
    }
  }, [])

  const renderableDocks = useMemo(() => docks.filter(isRenderableDock), [docks])

  // Wire each dock's state once so a selection change - from a click, or from
  // the frame-nav adapter reacting to in-frame navigation - updates the UI.
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

  // Mount a renderer dock (e.g. json-render) into the panel via the client
  // host's renderer registry - the local React renderer, or a prebuilt module
  // lazy-imported from the hub's renderer manifest - disposing when the
  // selection changes. Each mount gets a fresh container element (a
  // self-styling renderer may attach a shadow root to it); the typed mount
  // result drives the missing-renderer / load-error fallback below.
  useEffect(() => {
    const host = hostRef.current
    const dock = selectedDock
    const stage = panelRef.current
    if (!host || !dock || isIframeDock(dock) || !stage)
      return
    let alive = true
    let dispose: (() => void) | undefined
    setPanelFallback(null)
    const container = document.createElement('div')
    container.className = 'h-full w-full'
    stage.append(container)
    void host.context.renderers.mount(dock, container).then((result) => {
      if (!alive) {
        if (result.status === 'mounted')
          result.dispose()
        return
      }
      if (result.status === 'mounted') {
        dispose = result.dispose
        return
      }
      setPanelFallback(result.status === 'missing-renderer'
        ? {
            message: `No renderer for “${dock.type}” in the current environment`,
            hint: 'The host has not registered a renderer for this dock type.',
          }
        : {
            message: `The renderer for “${dock.type}” failed to load`,
            hint: 'Check the console, then re-select the dock to retry.',
          })
    })
    return () => {
      alive = false
      dispose?.()
      container.remove()
      setPanelFallback(null)
    }
  }, [selectedDockId, selectedIsIframe])

  async function ping() {
    if (!rpcRef.current)
      return
    try {
      const result = await rpcRef.current.call(
        'hub:commands:execute' as any,
        'example:next-devframe-hub:ping',
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
      {authNeeded && rpcRef.current && <AuthOverlay rpc={rpcRef.current} />}
      <header className="shrink-0 flex items-center gap-3 h-nav px-3 border-b border-base bg-base">
        <h1 className="m0 flex items-center gap-1.5 shrink-0 text-sm font-semibold select-none">
          <span className="i-ph-squares-four-duotone text-base color-active" />
          <span>Next Devframe Hub</span>
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
          {/* Renderer docks (json-render, …) mount here via the client host. */}
          <div ref={panelRef} hidden={!selectedDock || selectedIsIframe} className="absolute inset-0 of-auto bg-base p4" />
          {panelFallback && selectedDock && !selectedIsIframe && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-base p6 text-center">
              <div className="text-sm op-fade">{panelFallback.message}</div>
              <div className="text-xs op-mute">{panelFallback.hint}</div>
            </div>
          )}
        </main>
      </div>

      <footer className="grid grid-cols-4 shrink-0 gap-5 border-t border-base bg-base px4 py3 max-h-30vh of-auto">
        <section className="min-w-0">
          <h2 className={titleClass}>Transport</h2>
          <p className="m0 rounded-lg border border-base bg-base border-dashed px2.5 py1.5 text-xs font-mono op-mute">
            {transport
              ? `Connected over ${transport} (${transportPref === 'auto' ? 'auto-selected' : 'pinned'})`
              : 'Connecting…'}
          </p>
          {/* Segmented selector (LayoutTabs variant="segment" port): a
              bg-secondary track whose active trigger gets bg-base. */}
          <div className="mt2.5 inline-flex gap-0.5 rounded-lg bg-secondary p0.5">
            {TRANSPORT_PREFS.map(pref => (
              <button
                key={pref}
                type="button"
                onClick={() => applyTransportPref(pref)}
                className={`rounded-md border-none bg-transparent px2 py0.5 text-xs font-medium cursor-pointer ${pref === transportPref ? 'bg-base color-active shadow-sm' : 'color-muted hover:color-base'}`}
              >
                {transportLabel(pref)}
              </button>
            ))}
          </div>
        </section>

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
