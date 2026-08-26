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
import { dockIconSvg } from './icons'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

// The whole browser UI for the Vite hub, in plain DOM: it reads the hub's
// shared state (`devframe:docks` / `devframe:commands`) and its RPCs, and
// renders an icon rail + an iframe stage / renderer panel + a subsystem
// drawer. No hub classes are imported here - only the client protocol.

const HUB_BASE = '/__devframes/'

const el = {
  conn: document.querySelector<HTMLElement>('#conn')!,
  docks: document.querySelector<HTMLElement>('#docks')!,
  commands: document.querySelector<HTMLElement>('#commands')!,
  messages: document.querySelector<HTMLElement>('#messages')!,
  terminals: document.querySelector<HTMLElement>('#terminals')!,
  ping: document.querySelector<HTMLButtonElement>('#ping')!,
  stage: document.querySelector<HTMLElement>('#dock-stage')!,
  panel: document.querySelector<HTMLElement>('#dock-panel')!,
  transport: document.querySelector<HTMLElement>('#transport')!,
  transportToggle: document.querySelector<HTMLElement>('#transport-toggle')!,
}

// ── transport preference (`?transport=` param) ──────────────────────────────
// The hub serves both live transports (WS at `__ws`, SSE at `__sse`); the
// client's `transport` option picks one, `auto` trusting the server's
// advertisement. A connected client has no live switch, so the toggle writes
// the `?transport=` param and reloads to reconnect on the pinned transport.

const TRANSPORT_PREFS = ['auto', 'websocket', 'sse'] as const
type TransportPref = (typeof TRANSPORT_PREFS)[number]

function readTransportPref(): TransportPref {
  const raw = new URLSearchParams(location.search).get('transport')
  return (TRANSPORT_PREFS as readonly string[]).includes(raw ?? '') ? raw as TransportPref : 'auto'
}

function applyTransportPref(pref: TransportPref): void {
  const url = new URL(location.href)
  if (pref === 'auto')
    url.searchParams.delete('transport')
  else
    url.searchParams.set('transport', pref)
  location.href = url.href
}

function renderTransportToggle(current: TransportPref): void {
  el.transportToggle.innerHTML = TRANSPORT_PREFS.map((pref) => {
    const active = pref === current ? 'bg-base color-active shadow-sm' : 'color-muted hover:color-base'
    const label = pref === 'websocket' ? 'WS' : pref === 'sse' ? 'SSE' : 'Auto'
    return `<button type="button" data-transport="${pref}" class="rounded-md border-none bg-transparent px2 py0.5 text-xs font-medium cursor-pointer ${active}">${label}</button>`
  }).join('')
  for (const button of el.transportToggle.querySelectorAll<HTMLButtonElement>('[data-transport]'))
    button.addEventListener('click', () => applyTransportPref(button.dataset.transport as TransportPref))
}

// ── small DOM helpers ───────────────────────────────────────────────────────

function setStatus(text: string, kind?: 'ready' | 'error'): void {
  const dot = kind === 'ready' ? 'bg-success' : kind === 'error' ? 'bg-error' : 'bg-neutral-400'
  el.conn.innerHTML = `<span class="inline-block size-1.5 rounded-full shrink-0 ${dot} mr-1.5 align-middle"></span>${text}`
}

function renderList<T>(host: HTMLElement, items: readonly T[], row: (item: T) => string): void {
  host.innerHTML = items.length
    ? items.map(row).join('')
    : '<li class="rounded-lg border border-base bg-base border-dashed px2.5 py1.5 text-xs font-mono op-mute">empty</li>'
}

function iconName(icon: DevframeDockEntry['icon']): string | undefined {
  return typeof icon === 'string' ? icon : icon?.light
}

// One dock-rail button: a monogram placeholder for the icon (patched with the
// real SVG once `paintDockIcons` resolves it), the title, and an optional badge.
function dockButton(entry: DevframeDockEntry, selectedId: string | null): string {
  const active = entry.id === selectedId
  const initial = (entry.title?.[0] ?? '?').toUpperCase()
  const badge = entry.badge
    ? `<span class="ml-auto shrink-0 rounded bg-active px1 py0.5 text-[0.6rem] font-mono color-base">${entry.badge}</span>`
    : ''
  return `<li>
    <button type="button" data-dock-id="${entry.id}" title="${entry.title}"
      class="relative flex w-full items-center gap-2.5 px-2 py-1 rounded-md border border-transparent text-sm select-none cursor-pointer transition hover:op100 hover:bg-active${active ? ' op100 bg-active border-base! color-base' : ' op-fade'}">
      <span class="grid h-5 w-5 shrink-0 place-items-center rounded bg-active text-[0.7rem] font-bold" data-dock-icon="${entry.id}">${initial}</span>
      <span class="truncate">${entry.title}</span>${badge}
    </button>
  </li>`
}

// One-shot: fetch each dock's icon SVG (the shared `dockIconSvg` helper caches
// per name) and patch it into its rendered placeholder. A missing/failed icon
// keeps the monogram.
function paintDockIcons(list: readonly DevframeDockEntry[]): void {
  for (const entry of list) {
    if (!iconName(entry.icon))
      continue
    void dockIconSvg(entry.icon).then((svg) => {
      const slot = el.docks.querySelector<HTMLElement>(`[data-dock-icon="${entry.id}"]`)
      if (svg && slot) {
        slot.className = 'h-5 w-5 shrink-0 text-lg'
        slot.innerHTML = svg
      }
    })
  }
}

function isIframeDock(d: DevframeDockEntry): d is DevframeViewIframe & { url: string } {
  return d.type === 'iframe' && typeof (d as { url?: unknown }).url === 'string'
}

// Dock types this shell renders natively (or that carry no panel view). Every
// other type routes through the client host's renderer registry - a renderer
// registered locally or served by the hub's renderer manifest (e.g.
// `json-render`) - and a type nothing covers shows the missing-renderer
// fallback in `mountRenderer`.
const NATIVE_TYPES = new Set(['action', 'launcher', 'group', '~builtin'])
function isRenderableDock(d: DevframeDockEntry): boolean {
  return isIframeDock(d) || !NATIVE_TYPES.has(d.type)
}

// ── client-only dock content (synthesized in the browser) ───────────────────

// A self-contained document for the client-only "Client Notes" dock, from a
// Blob URL - no server route.
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
  to the hub node side or to any other connected surface.</p>
<p>Patch it live through the returned handle with <code>update()</code> (its
  <code>badge</code> was set that way), or remove it with <code>dispose()</code>.</p>`
  return URL.createObjectURL(new Blob([html], { type: 'text/html' }))
}

// An *interactive* json-render spec synthesized entirely in the browser - the
// client-only counterpart to a server-authored view. `{ $bindState }` inputs
// write into the view's own `state`, `{ $state }` reads mirror it live, and the
// buttons use the built-in `pushState` / `setState` actions - no server, no
// shared state, rendered by the same manifest-served `json-render` module.
function createClientPlaygroundSpec(clientType: string): DevframeJsonRenderSpec {
  return {
    root: 'root',
    elements: {
      root: { type: 'Stack', props: { gap: 14 }, children: ['head', 'hello', 'notes', 'env'] },

      head: { type: 'Stack', props: { direction: 'row', gap: 8, align: 'center' }, children: ['icon', 'title', 'badge'] },
      icon: { type: 'Icon', props: { name: 'ph:sliders-horizontal-duotone', size: 22 }, children: [] },
      title: { type: 'Text', props: { text: 'Client Playground', variant: 'heading' }, children: [] },
      badge: { type: 'Badge', props: { text: 'client-only', variant: 'info' }, children: [] },

      // Two-way binding: type a name, see it echoed live; toggle a switch.
      hello: { type: 'Card', props: { title: 'Say hello' }, children: ['helloBody'] },
      helloBody: { type: 'Stack', props: { gap: 10 }, children: ['nameInput', 'greetRow', 'compact'] },
      nameInput: { type: 'TextInput', props: { label: 'Your name', placeholder: 'Type your name…', value: { $bindState: '/form/name' } }, children: [] },
      greetRow: { type: 'Stack', props: { direction: 'row', gap: 6, align: 'center' }, children: ['greetLabel', 'greetName'] },
      greetLabel: { type: 'Text', props: { text: 'Hello,', variant: 'body', color: 'muted' }, children: [] },
      greetName: { type: 'Text', props: { text: { $state: '/form/name' }, variant: 'body', color: 'primary' }, children: [] },
      compact: { type: 'Switch', props: { label: 'Compact mode', value: { $bindState: '/prefs/compact' } }, children: [] },

      // Actions mutate state → the DataTable re-renders.
      notes: { type: 'Card', props: { title: 'Notes' }, children: ['notesBody'] },
      notesBody: { type: 'Stack', props: { gap: 10 }, children: ['draftRow', 'notesTable', 'clearBtn'] },
      draftRow: { type: 'Stack', props: { direction: 'row', gap: 8, align: 'end' }, children: ['draftInput', 'addBtn'] },
      draftInput: { type: 'TextInput', props: { label: 'New note', placeholder: 'Write something…', value: { $bindState: '/draft' } }, children: [] },
      addBtn: {
        type: 'Button',
        props: { label: 'Add', variant: 'primary', icon: 'ph:plus' },
        on: { press: { action: 'pushState', params: { statePath: '/notes', value: { text: { $state: '/draft' } }, clearStatePath: '/draft' } } },
        children: [],
      },
      notesTable: { type: 'DataTable', props: { columns: [{ key: 'text', label: 'Note' }], rows: { $state: '/notes' }, height: 160 }, children: [] },
      clearBtn: {
        type: 'Button',
        props: { label: 'Clear all', variant: 'ghost', icon: 'ph:trash' },
        on: { press: { action: 'setState', params: { statePath: '/notes', value: [] } } },
        children: [],
      },

      env: { type: 'Card', props: { title: 'Environment', collapsible: true, defaultCollapsed: true }, children: ['envTable'] },
      envTable: {
        type: 'KeyValueTable',
        props: { data: { clientType, language: navigator.language, viewport: `${window.innerWidth}×${window.innerHeight}` } },
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

// ── authorization gate (interactive OTP) ────────────────────────────────────
// The hub gates every connection; this shell opts out of devframe's native
// `prompt()` (`simpleAuth: false`) and renders its own authorization view,
// mirroring the reference UI's `ViewBuiltinClientAuthNotice`. Trust can arrive
// three ways: a stored bearer token or the magic-link OTP resolves the
// handshake silently (the overlay never shows), otherwise the connection
// settles `unauthorized` and the user types the 6-digit code from the terminal.

function authorize(rpc: Awaited<ReturnType<typeof connectDevframe>>): Promise<void> {
  if (rpc.isTrusted)
    return Promise.resolve()
  return new Promise<void>((resolve) => {
    const overlay = createAuthOverlay(rpc)
    // Reveal the code entry only once the handshake has actually been refused,
    // so the silent stored-token / magic-link paths don't flash the overlay.
    const reveal = (status: string): void => {
      if (status === 'unauthorized')
        overlay.reveal()
    }
    const offStatus = rpc.events.on('connection:status', reveal)
    const offTrust = rpc.events.on('rpc:is-trusted:updated', (trusted) => {
      if (!trusted)
        return
      offTrust()
      offStatus()
      overlay.remove()
      resolve()
    })
    reveal(rpc.status)
  })
}

function createAuthOverlay(
  rpc: Awaited<ReturnType<typeof connectDevframe>>,
): { reveal: () => void, remove: () => void } {
  const overlay = document.createElement('div')
  overlay.hidden = true
  overlay.className = 'fixed inset-0 grid place-items-center overflow-auto bg-base p8 color-base'
  overlay.innerHTML = `
    <div class="w-full max-w-100 flex flex-col items-center text-center">
      <div class="grid size-16 place-items-center rounded-2xl bg-active">
        <span class="i-ph-shield-check-duotone text-4xl color-active"></span>
      </div>
      <h1 class="mt5 text-2xl font-bold tracking-tight">Authorize Vite Devframe Hub</h1>
      <p class="mt2 max-w-88 text-sm op-fade leading-relaxed">
        This hub can access your server, read your filesystem, and run commands.
        Confirm it's you before continuing.
      </p>
      <form class="mt6 w-full flex flex-col items-center gap-4 rounded-xl border border-base bg-secondary p6 shadow-sm">
        <p class="text-sm op-fade">Enter the <span class="font-mono color-active">6-digit code</span> printed in your terminal.</p>
        <input data-code inputmode="numeric" autocomplete="one-time-code" maxlength="6"
          aria-label="One-time authorization code" placeholder="••••••"
          class="w-56 rounded-lg border border-base bg-base px3 py2 text-center text-2xl font-mono tracking-[0.4em] color-base outline-none focus:border-active" />
        <button data-submit type="submit" class="btn-primary w-full justify-center py2!">Authorize</button>
        <p data-error class="min-h-5 text-sm text-red-500" role="alert" aria-live="assertive"></p>
      </form>
    </div>`

  const form = overlay.querySelector<HTMLFormElement>('form')!
  const input = overlay.querySelector<HTMLInputElement>('[data-code]')!
  const button = overlay.querySelector<HTMLButtonElement>('[data-submit]')!
  const error = overlay.querySelector<HTMLElement>('[data-error]')!

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6)
    error.textContent = ''
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const code = input.value.trim()
    if (code.length < 6 || button.disabled)
      return
    button.disabled = true
    button.textContent = 'Authorizing…'
    try {
      const ok = await rpc.requestTrustWithCode(code)
      if (!ok) {
        error.textContent = 'That code didn\u2019t match. Check your terminal and try again.'
        input.value = ''
        input.focus()
      }
      // On success the trust listener in `authorize()` removes this overlay.
    }
    catch {
      error.textContent = 'Something went wrong while authorizing. Please try again.'
    }
    finally {
      button.disabled = false
      button.textContent = 'Authorize'
    }
  })

  document.body.append(overlay)
  return {
    reveal() {
      if (!overlay.hidden)
        return
      overlay.hidden = false
      setStatus('Waiting for authorization…')
      input.focus()
    },
    remove: () => overlay.remove(),
  }
}

async function main(): Promise<void> {
  setStatus('Connecting…')
  const transportPref = readTransportPref()
  renderTransportToggle(transportPref)
  // The hub gates by default (interactive OTP). `simpleAuth: false` opts out of
  // devframe's native `prompt()` fallback so this shell can drive its own
  // authorization view; the magic-link OTP (`?devframe_otp=` on the URL) is
  // still consumed automatically. `connectDevframe` returns before the trust
  // handshake settles, so `authorize()` holds the UI until this client is
  // trusted (via a stored token, the magic link, or the code the user enters).
  const rpc = await connectDevframe({ baseURL: HUB_BASE, transport: transportPref, simpleAuth: false })
  await authorize(rpc)
  setStatus(`Connected · transport=${rpc.transport}`, 'ready')
  el.transport.textContent = `Connected over ${rpc.transport} (${transportPref === 'auto' ? 'auto-selected' : 'pinned'})`

  // Boot the framework-level client host: it assembles the shared client
  // context and imports each dock's client script into this page (e.g. the
  // a11y agent). `json-render` docks render through the module the hub serves
  // via its renderer manifest - imported lazily by the registry on first mount.
  const host = await createDevframeClientHost({ rpc })
  const docksCtx = host.context.docks

  // Two *client-only* docks, registered on the client host context so they
  // stay local to this page (never entering `devframe:docks` shared state):
  // an iframe dock (from a Blob URL) and an interactive inline json-render view.
  const notes = docksCtx.register<DevframeViewIframe>({
    id: 'client-notes',
    title: 'Client Notes',
    icon: 'ph:note-pencil-duotone',
    type: 'iframe',
    url: createClientNotesUrl(),
    category: 'app',
  })
  notes.update({ badge: host.context.clientType }) // patch in place via the handle
  docksCtx.register<DevframeJsonRenderDockEntry>({
    id: 'client-playground',
    title: 'Client Playground',
    icon: 'ph:sliders-horizontal-duotone',
    type: 'json-render',
    view: { spec: createClientPlaygroundSpec(host.context.clientType) },
    category: 'app',
  })

  wireDockRail(host)
  await wireDrawer(rpc)
}

// ── the dock rail + stage ────────────────────────────────────────────────────

function wireDockRail(host: Awaited<ReturnType<typeof createDevframeClientHost>>): void {
  const docksCtx = host.context.docks

  // Keep-alive iframe pool: one iframe per `frameId` (shared-frame docks) or
  // per dock id. Switching docks toggles visibility instead of reloading, so
  // shared-frame member docks soft-navigate via the frame-nav adapter.
  const iframes = new Map<string, HTMLIFrameElement>()
  const frameKeyOf = (e: DevframeDockEntry): string => (e as DevframeViewIframe).frameId ?? e.id

  function ensureIframe(entry: DevframeViewIframe & { url: string }): HTMLIFrameElement {
    const key = frameKeyOf(entry)
    let frame = iframes.get(key)
    if (!frame) {
      frame = document.createElement('iframe')
      frame.title = entry.title
      frame.className = 'absolute inset-0 block h-full w-full border-0 bg-base'
      frame.hidden = true
      frame.src = entry.url
      el.stage.appendChild(frame)
      iframes.set(key, frame)
      // Hand the element to the client host so its frame-nav adapter can attach
      // to a `subTabs` anchor.
      const state = docksCtx.getStateById(entry.id)
      if (state) {
        state.domElements.iframe = frame
        state.events.emit('dom:iframe:mounted', frame)
      }
    }
    return frame
  }

  // The currently mounted renderer-dock (json-render, …), so we dispose it
  // before mounting another.
  let mounted: { id: string, dispose: () => void } | null = null

  async function mountRenderer(entry: DevframeDockEntry): Promise<void> {
    if (mounted?.id === entry.id)
      return
    mounted?.dispose()
    mounted = null
    el.panel.hidden = false
    el.panel.innerHTML = ''
    // A fresh container per mount - a self-styling renderer may attach a shadow
    // root to it.
    const container = document.createElement('div')
    container.className = 'h-full w-full'
    el.panel.append(container)

    const result = await host.context.renderers.mount(entry, container)
    if (result.status === 'mounted') {
      mounted = { id: entry.id, dispose: result.dispose }
      return
    }
    // The typed mount result carries the fallback states: a type nothing
    // covers, or a renderer module that failed to load (re-select to retry).
    container.remove()
    const message = result.status === 'missing-renderer'
      ? `No renderer for “${entry.type}” in the current environment`
      : `The renderer for “${entry.type}” failed to load`
    const hint = result.status === 'missing-renderer'
      ? 'The host has not registered a renderer for this dock type.'
      : 'Check the console, then re-select the dock to retry.'
    el.panel.innerHTML = `<div class="h-full w-full flex flex-col items-center justify-center gap-2 p6 text-center">
      <div class="text-sm op-fade">${message}</div><div class="text-xs op-mute">${hint}</div>
    </div>`
  }

  function showSelection(list: DevframeDockEntry[]): void {
    const entry = docksCtx.selectedId ? list.find(d => d.id === docksCtx.selectedId) ?? null : null

    // A renderer dock (json-render, …) owns the panel; anything else (an
    // iframe dock, or no selection) hides the panel and disposes any mount.
    if (entry && !isIframeDock(entry)) {
      for (const frame of iframes.values()) frame.hidden = true
      void mountRenderer(entry)
      return
    }

    if (mounted) {
      mounted.dispose()
      mounted = null
    }
    el.panel.hidden = true
    const active = entry && isIframeDock(entry) ? ensureIframe(entry) : null
    for (const frame of iframes.values()) frame.hidden = frame !== active
  }

  // Re-render when the merged dock list changes and when the selection flips
  // (a click, or the frame-nav adapter reacting to in-frame navigation).
  const wired = new Set<string>()
  function render(): void {
    // The rail also lists panel-less `action` docks as momentary buttons.
    const list = docksCtx.entries.filter(d => isRenderableDock(d) || d.type === 'action')
    const selectable = list.filter(isRenderableDock)
    if (!docksCtx.selectedId && selectable.length > 0)
      void docksCtx.switchEntry(selectable[0].id)

    for (const entry of list) {
      if (wired.has(entry.id))
        continue
      wired.add(entry.id)
      docksCtx.getStateById(entry.id)?.events.on('entry:activated', render)
    }

    renderList(el.docks, list, entry => dockButton(entry, docksCtx.selectedId))
    paintDockIcons(list)
    showSelection(list)
  }

  el.docks.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-dock-id]')
    const id = button?.dataset.dockId
    if (!id)
      return
    // Momentary action dock: fire its client script, keep the panel as-is.
    const state = docksCtx.getStateById(id)
    if (state?.entryMeta.type === 'action') {
      state.events.emit('entry:activated')
      return
    }
    if (id !== docksCtx.selectedId)
      void docksCtx.switchEntry(id)
  })

  void host.context.rpc.sharedState
    .get<DevframeDockEntry[]>('devframe:docks', { initialValue: [] })
    .then(docks => docks.on('updated', render))
  // The frame-nav adapter registers client-only member docks in response to a
  // shared-frame anchor's manifest; re-render after it reconciles (microtask).
  window.addEventListener('message', (event) => {
    const data = event.data as { channel?: string, from?: string } | undefined
    if (data?.channel === FRAME_NAV_CHANNEL && data.from === 'frame')
      queueMicrotask(render)
  })
  render()
}

// ── the subsystem drawer (commands / messages / terminals) ──────────────────

async function wireDrawer(rpc: Awaited<ReturnType<typeof connectDevframe>>): Promise<void> {
  // Commands - read straight from `devframe:commands` shared state.
  const commands = await rpc.sharedState.get<DevframeCommandEntry[]>('devframe:commands', { initialValue: [] })
  const renderCommands = (): void => renderList(el.commands, commands.value() ?? [], c =>
    `<li class="rounded-lg border border-base bg-base px2.5 py1.5 text-xs font-mono">${c.title} <code class="op-fade">${c.id}</code></li>`)
  commands.on('updated', renderCommands)
  renderCommands()

  // Messages + terminals - polled through kit-local RPCs (a fuller kit would
  // register a client handler for the hub's `*:updated` broadcasts instead).
  const refreshMessages = async (): Promise<void> => {
    const entries = await rpc.call('example:vite-devframe-hub:messages:list' as any) as DevframeMessageEntry[]
    renderList(el.messages, entries, m =>
      `<li class="rounded-lg border border-base bg-base px2.5 py1.5 text-xs font-mono"><span class="op-fade">[${m.level}]</span> ${m.message}</li>`)
  }
  const refreshTerminals = async (): Promise<void> => {
    const sessions = await rpc.call('example:vite-devframe-hub:terminals:list' as any) as Pick<DevframeTerminalSession, 'id' | 'title' | 'status'>[]
    renderList(el.terminals, sessions, t =>
      `<li class="rounded-lg border border-base bg-base px2.5 py1.5 text-xs font-mono">${t.title} <code class="op-fade">${t.id}</code> · ${t.status}</li>`)
  }
  await Promise.all([refreshMessages(), refreshTerminals()])
  setInterval(() => {
    void refreshMessages()
    void refreshTerminals()
  }, 2000)

  // Dispatch the server-registered sample command through the built-in RPC.
  el.ping.addEventListener('click', async () => {
    try {
      const result = await rpc.call('hub:commands:execute' as any, 'example:vite-devframe-hub:ping')
      el.ping.textContent = `Ping returned ${JSON.stringify(result)}`
    }
    catch (err) {
      el.ping.textContent = `Error: ${(err as Error).message}`
    }
  })
}

main().catch((err) => {
  setStatus(`Failed: ${(err as Error).message}`, 'error')
  console.error(err)
})
