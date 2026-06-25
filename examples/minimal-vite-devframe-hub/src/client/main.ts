import type {
  DevframeCommandEntry,
  DevframeDockEntry,
  DevframeMessageEntry,
  DevframeTerminalSession,
} from '@devframes/hub/types'
import { connectDevframe } from '@devframes/hub/client'
import { iconClass } from './icons'
import 'virtual:uno.css'
import '@internal/design/theme.css'

const HUB_BASE = '/__hub/'

const connEl = document.querySelector<HTMLElement>('#conn')!
const docksEl = document.querySelector<HTMLElement>('#docks')!
const commandsEl = document.querySelector<HTMLElement>('#commands')!
const messagesEl = document.querySelector<HTMLElement>('#messages')!
const terminalsEl = document.querySelector<HTMLElement>('#terminals')!
const pingBtn = document.querySelector<HTMLButtonElement>('#ping')!
const iframeEl = document.querySelector<HTMLIFrameElement>('#dock-iframe')!

let selectedDockId: string | null = null

function setStatus(text: string, kind?: 'ready' | 'error') {
  const dot = kind === 'ready' ? 'df-dot-running' : kind === 'error' ? 'df-dot-error' : 'df-dot-idle'
  connEl.innerHTML = `<span class="df-dot ${dot} mr-1.5 align-middle"></span>${text}`
}

function renderList<T>(host: HTMLElement, items: readonly T[], render: (item: T) => string) {
  if (!items.length) {
    host.innerHTML = '<li class="df-panel border-dashed px2.5 py1.5 text-xs font-mono op-mute">empty</li>'
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
  return `<span class="grid h-5 w-5 shrink-0 place-items-center rounded bg-accent text-[0.7rem] font-bold">${initial}</span>`
}

function isIframeDock(d: DevframeDockEntry): d is DevframeDockEntry & { type: 'iframe', url: string } {
  return d.type === 'iframe' && typeof (d as { url?: unknown }).url === 'string'
}

async function main() {
  setStatus('Connecting…')

  const rpc = await connectDevframe({ baseURL: HUB_BASE })
  setStatus(`Connected · backend=${rpc.connectionMeta.backend}`, 'ready')

  // 1. Docks — read from `devframe:docks` shared state.
  const docks = await rpc.sharedState.get<DevframeDockEntry[]>(
    'devframe:docks',
    { initialValue: [] },
  )

  const renderDocks = () => {
    const iframeDocks = (docks.value() ?? []).filter(isIframeDock)

    if (selectedDockId && !iframeDocks.some(d => d.id === selectedDockId))
      selectedDockId = null
    if (!selectedDockId && iframeDocks.length > 0)
      selectedDockId = iframeDocks[0].id

    if (!iframeDocks.length) {
      docksEl.innerHTML = '<li class="op-mute px2 text-sm">No iframe docks</li>'
      iframeEl.src = 'about:blank'
      return
    }

    renderList(docksEl, iframeDocks, d =>
      `<li><button type="button" data-dock-id="${d.id}" class="df-navtab w-full! max-w-none! gap-2.5!${d.id === selectedDockId ? ' df-navtab-active' : ''}" title="${d.title}">${dockIcon(d)}<span class="truncate">${d.title}</span></button></li>`)

    const selected = iframeDocks.find(d => d.id === selectedDockId)
    if (selected && iframeEl.getAttribute('src') !== selected.url)
      iframeEl.src = selected.url
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
    `<li class="df-panel px2.5 py1.5 text-xs font-mono">${c.title} <code class="op-fade">${c.id}</code></li>`)
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
      `<li class="df-panel px2.5 py1.5 text-xs font-mono"><span class="op-fade">[${m.level}]</span> ${m.message}</li>`)
  }
  await refreshMessages()

  // 4. Terminals — same pattern as messages.
  const refreshTerminals = async () => {
    const sessions = await rpc.call(
      'minimal-vite-devframe-hub:terminals:list' as any,
    ) as Pick<DevframeTerminalSession, 'id' | 'title' | 'status' | 'description'>[]
    renderList(terminalsEl, sessions, t =>
      `<li class="df-panel px2.5 py1.5 text-xs font-mono">${t.title} <code class="op-fade">${t.id}</code> · ${t.status}</li>`)
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
