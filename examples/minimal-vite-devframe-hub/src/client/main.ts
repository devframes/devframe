import type {
  DevframeCommandEntry,
  DevframeDockEntry,
  DevframeMessageEntry,
  DevframeTerminalSession,
  DevframeViewIframe,
} from '@devframes/hub/types'
import type { DevframeJsonRenderSpec } from '@devframes/json-render'
import type { DevframeJsonRenderDockEntry } from '@devframes/json-render/hub'
import { connectDevframe, createDevframeClientHost } from '@devframes/hub/client'
import { createJsonRenderDockRenderer } from '@devframes/json-render-ui'
import { iconClass } from './icons'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

const HUB_BASE = '/__hub/'

const connEl = document.querySelector<HTMLElement>('#conn')!
const docksEl = document.querySelector<HTMLElement>('#docks')!
const commandsEl = document.querySelector<HTMLElement>('#commands')!
const messagesEl = document.querySelector<HTMLElement>('#messages')!
const terminalsEl = document.querySelector<HTMLElement>('#terminals')!
const pingBtn = document.querySelector<HTMLButtonElement>('#ping')!
const iframeEl = document.querySelector<HTMLIFrameElement>('#dock-iframe')!
const panelEl = document.querySelector<HTMLElement>('#dock-panel')!

let selectedDockId: string | null = null
// Disposer for the currently mounted renderer dock (e.g. json-render).
let disposePanel: (() => void) | null = null

function setStatus(text: string, kind?: 'ready' | 'error') {
  const dot = kind === 'ready' ? 'bg-success' : kind === 'error' ? 'bg-error' : 'bg-neutral-400'
  connEl.innerHTML = `<span class="inline-block size-1.5 rounded-full shrink-0 ${dot} mr-1.5 align-middle"></span>${text}`
}

function renderList<T>(host: HTMLElement, items: readonly T[], render: (item: T) => string) {
  if (!items.length) {
    host.innerHTML = '<li class="rounded-lg border border-base bg-base border-dashed px2.5 py1.5 text-xs font-mono op-mute">empty</li>'
    return
  }
  host.innerHTML = items.map(render).join('')
}

/** Render a dock icon, falling back to the title's initial when unknown. */
function dockIcon(entry: DevframeDockEntry): string {
  const cls = iconClass(entry.icon)
  if (cls)
    return `<span class="${cls} shrink-0 text-lg"></span>`
  const initial = (entry.title?.[0] ?? '?').toUpperCase()
  return `<span class="grid h-5 w-5 shrink-0 place-items-center rounded bg-active text-[0.7rem] font-bold">${initial}</span>`
}

function isIframeDock(d: DevframeDockEntry): d is DevframeDockEntry & { type: 'iframe', url: string } {
  return d.type === 'iframe' && typeof (d as { url?: unknown }).url === 'string'
}

// A dock this shell can display: an iframe, or one with a registered renderer
// (e.g. the json-render dock, rendered by @devframes/json-render-ui).
const RENDERER_TYPES = new Set(['json-render'])
function isRenderableDock(d: DevframeDockEntry): boolean {
  return isIframeDock(d) || RENDERER_TYPES.has(d.type)
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
// state — every change re-renders through the same `createJsonRenderDockRenderer`.
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

async function main() {
  setStatus('Connecting…')

  const rpc = await connectDevframe({ baseURL: HUB_BASE })
  setStatus(`Connected · backend=${rpc.connectionMeta.backend}`, 'ready')

  // Boot the framework-level client host: it builds the shared client context
  // and imports each dock's client script into this page — e.g. the a11y
  // inspector's in-page agent, which then scans this host live. The dock UI
  // below still reads the same shared state directly.
  //
  // Register the JSON-render dock renderer so the hub can display a
  // `json-render` dock (authored server-side via @devframes/json-render).
  const host = await createDevframeClientHost({
    rpc,
    renderers: { 'json-render': createJsonRenderDockRenderer() },
  })

  // Register a *client-only* dock — one this page synthesizes itself. Unlike
  // the server-authored docks, it's registered on the client host context, so
  // it never enters the `devframe:docks` shared state: it stays local to this
  // page and is not synced to the hub server or other viewers. It merges into
  // `host.context.docks.entries` (read below) alongside the server docks.
  const clientDock = host.context.docks.register<DevframeViewIframe>({
    id: 'client-notes',
    title: 'Client Notes',
    icon: 'ph:note-pencil-duotone',
    type: 'iframe',
    url: createClientNotesUrl(),
    category: 'app',
  })
  // Patch it in place with the returned handle (the id is immutable). Call
  // `clientDock.dispose()` to remove it from the merged list again.
  clientDock.update({ badge: host.context.clientType })

  // Register a second client-only dock — this one a *json-render* view the page
  // authors itself, the richer sibling of the iframe dock above. Its spec is
  // carried **inline** in the dock entry (`view.spec`), so it needs no shared
  // state at all: it lives only in this page yet renders — and stays fully
  // interactive (inputs, toggles, and buttons that mutate its state) — through
  // the very same `json-render` dock renderer registered above as a
  // server-authored view.
  host.context.docks.register<DevframeJsonRenderDockEntry>({
    id: 'client-playground',
    title: 'Client Playground',
    icon: 'ph:sliders-horizontal-duotone',
    type: 'json-render',
    view: { spec: createClientPlaygroundSpec(host.context.clientType) },
    category: 'app',
  })

  // 1. Docks — the merged list from the client host: server docks (projected
  // from `devframe:docks` shared state) plus the client-only dock above. We
  // still subscribe to the shared state to re-render when server docks change.
  const docks = await rpc.sharedState.get<DevframeDockEntry[]>(
    'devframe:docks',
    { initialValue: [] },
  )

  // The dock currently mounted into the viewport (iframe or renderer panel).
  let mountedDockId: string | null = null

  async function applySelection(list: DevframeDockEntry[]): Promise<void> {
    if (selectedDockId === mountedDockId)
      return
    mountedDockId = selectedDockId
    // Tear down any active renderer mount (json-render) before switching.
    disposePanel?.()
    disposePanel = null

    const entry = list.find(d => d.id === selectedDockId) ?? null
    if (!entry) {
      iframeEl.hidden = false
      iframeEl.src = 'about:blank'
      panelEl.hidden = true
      return
    }
    if (isIframeDock(entry)) {
      panelEl.hidden = true
      panelEl.innerHTML = ''
      iframeEl.hidden = false
      iframeEl.src = entry.url
    }
    else {
      // A renderer dock (json-render): mount it into the panel via the client
      // host's renderer registry. The Vue app subscribes to the view's shared
      // state and updates live.
      iframeEl.hidden = true
      iframeEl.src = 'about:blank'
      panelEl.hidden = false
      panelEl.innerHTML = ''
      disposePanel = await host.context.renderers.mount(entry, panelEl)
    }
  }

  const renderDocks = () => {
    const list = host.context.docks.entries.filter(isRenderableDock)

    if (selectedDockId && !list.some(d => d.id === selectedDockId))
      selectedDockId = null
    if (!selectedDockId && list.length > 0)
      selectedDockId = list[0].id

    if (!list.length) {
      docksEl.innerHTML = '<li class="op-mute px2 text-sm">No docks</li>'
      mountedDockId = null
      disposePanel?.()
      disposePanel = null
      iframeEl.src = 'about:blank'
      return
    }

    renderList(docksEl, list, d =>
      `<li><button type="button" data-dock-id="${d.id}" class="relative inline-flex items-center gap-1.5 max-w-52 px-2 py-1 rounded-md border border-transparent text-sm op-fade select-none cursor-pointer transition hover:op100 hover:bg-active w-full! max-w-none! gap-2.5!${d.id === selectedDockId ? ' op100! bg-active border-base! color-base' : ''}" title="${d.title}">${dockIcon(d)}<span class="truncate">${d.title}</span>${d.badge ? `<span class="ml-auto shrink-0 rounded bg-active px1 py0.5 text-[0.6rem] font-mono color-base">${d.badge}</span>` : ''}</button></li>`)

    void applySelection(list)
  }

  docksEl.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-dock-id]')
    if (!target)
      return
    const id = target.dataset.dockId
    if (!id || id === selectedDockId)
      return
    selectedDockId = id
    renderDocks()
  })

  docks.on('updated', renderDocks)
  renderDocks()

  // 2. Commands — read from `devframe:commands` shared state.
  const commands = await rpc.sharedState.get<DevframeCommandEntry[]>(
    'devframe:commands',
    { initialValue: [] },
  )
  const renderCommands = () => renderList(commandsEl, commands.value() ?? [], c =>
    `<li class="rounded-lg border border-base bg-base px2.5 py1.5 text-xs font-mono">${c.title} <code class="op-fade">${c.id}</code></li>`)
  commands.on('updated', renderCommands)
  renderCommands()

  // 3. Messages — pulled via a kit-local RPC. A fuller kit would also
  //    register a client-side RPC handler for `devframe:messages:updated`
  //    to refresh on broadcast; this minimal example polls instead.
  const refreshMessages = async () => {
    const entries = await rpc.call(
      'minimal-vite-devframe-hub:messages:list' as any,
    ) as DevframeMessageEntry[]
    renderList(messagesEl, entries, m =>
      `<li class="rounded-lg border border-base bg-base px2.5 py1.5 text-xs font-mono"><span class="op-fade">[${m.level}]</span> ${m.message}</li>`)
  }
  await refreshMessages()

  // 4. Terminals — same pattern as messages.
  const refreshTerminals = async () => {
    const sessions = await rpc.call(
      'minimal-vite-devframe-hub:terminals:list' as any,
    ) as Pick<DevframeTerminalSession, 'id' | 'title' | 'status' | 'description'>[]
    renderList(terminalsEl, sessions, t =>
      `<li class="rounded-lg border border-base bg-base px2.5 py1.5 text-xs font-mono">${t.title} <code class="op-fade">${t.id}</code> · ${t.status}</li>`)
  }
  await refreshTerminals()

  setInterval(() => {
    void refreshMessages()
    void refreshTerminals()
  }, 2000)

  // 5. Exercise the hub:commands:execute built-in by dispatching the
  //    sample ping command registered server-side.
  pingBtn.addEventListener('click', async () => {
    try {
      const result = await rpc.call(
        'hub:commands:execute' as any,
        'minimal-vite-devframe-hub:ping',
      )
      pingBtn.textContent = `Ping returned ${JSON.stringify(result)}`
    }
    catch (err) {
      pingBtn.textContent = `Error: ${(err as Error).message}`
    }
  })
}

main().catch((err) => {
  setStatus(`Failed: ${(err as Error).message}`, 'error')
  console.error(err)
})
