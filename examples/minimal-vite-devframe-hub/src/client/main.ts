import type {
  DevframeCommandEntry,
  DevframeDockEntry,
  DevframeMessageEntry,
  DevframeTerminalSession,
} from '@devframes/hub/types'
import { connectDevframe } from '@devframes/hub/client'

const HUB_BASE = '/__hub/'

const statusEl = document.querySelector<HTMLElement>('#status')!
const connEl = document.querySelector<HTMLElement>('#conn')!
const docksEl = document.querySelector<HTMLElement>('#docks')!
const commandsEl = document.querySelector<HTMLElement>('#commands')!
const messagesEl = document.querySelector<HTMLElement>('#messages')!
const terminalsEl = document.querySelector<HTMLElement>('#terminals')!
const pingBtn = document.querySelector<HTMLButtonElement>('#ping')!
const iframeEl = document.querySelector<HTMLIFrameElement>('#dock-iframe')!

let selectedDockId: string | null = null

function setStatus(text: string, klass?: 'ready' | 'error') {
  connEl.textContent = text
  statusEl.className = klass ?? ''
}

function renderList<T>(host: HTMLElement, items: T[], render: (item: T) => string) {
  if (!items.length) {
    host.innerHTML = '<li class="muted">empty</li>'
    return
  }
  host.innerHTML = items.map(render).join('')
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
      docksEl.innerHTML = '<li class="muted">No iframe docks</li>'
      iframeEl.src = 'about:blank'
      return
    }

    renderList(docksEl, iframeDocks, d =>
      `<li><button type="button" data-dock-id="${d.id}" class="${d.id === selectedDockId ? 'active' : ''}">${d.title}</button></li>`)

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
    `<li><strong>${c.title}</strong> <code>${c.id}</code></li>`)
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
      `<li><strong>[${m.level}]</strong> ${m.message}</li>`)
  }
  await refreshMessages()

  // 4. Terminals — same pattern as messages.
  const refreshTerminals = async () => {
    const sessions = await rpc.call(
      'minimal-vite-devframe-hub:terminals:list' as any,
    ) as Pick<DevframeTerminalSession, 'id' | 'title' | 'status' | 'description'>[]
    renderList(terminalsEl, sessions, t =>
      `<li><strong>${t.title}</strong> <code>${t.id}</code> · ${t.status}</li>`)
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
