import type {
  DevToolsCommandEntry,
  DevToolsDockEntry,
  DevToolsMessageEntry,
  DevToolsTerminalSession,
} from '@devframes/hub/types'
import { connectDevframe } from '@devframes/hub/client'

const HUB_BASE = '/__hub/'

const statusEl = document.querySelector<HTMLElement>('#status')!
const connEl = document.querySelector<HTMLElement>('#conn')!
const docksEl = document.querySelector<HTMLElement>('#docks')!
const commandsEl = document.querySelector<HTMLElement>('#commands')!
const messagesEl = document.querySelector<HTMLElement>('#messages')!
const terminalsEl = document.querySelector<HTMLElement>('#terminals')!
const openPathBtn = document.querySelector<HTMLButtonElement>('#open-path')!

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

async function main() {
  setStatus('Connecting…')

  const rpc = await connectDevframe({ baseURL: HUB_BASE })
  setStatus(`Connected · backend=${rpc.connectionMeta.backend}`, 'ready')

  // 1. Docks — read from `devframe:docks` shared state.
  const docks = await rpc.sharedState.get<DevToolsDockEntry[]>(
    'devframe:docks',
    { initialValue: [] },
  )
  const renderDocks = () => renderList(docksEl, docks.value() ?? [], (d) => {
    const badge = d.badge ? ` <span class="badge">[${d.badge}]</span>` : ''
    return `<li><strong>${d.title}</strong> <code>${d.id}</code>${badge}</li>`
  })
  docks.on('updated', renderDocks)
  renderDocks()

  // 2. Commands — read from `devframe:commands` shared state.
  const commands = await rpc.sharedState.get<DevToolsCommandEntry[]>(
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
      'minimal-hub-kit:messages:list' as any,
    ) as DevToolsMessageEntry[]
    renderList(messagesEl, entries, m =>
      `<li><strong>[${m.level}]</strong> ${m.message}</li>`)
  }
  await refreshMessages()

  // 4. Terminals — same pattern as messages.
  const refreshTerminals = async () => {
    const sessions = await rpc.call(
      'minimal-hub-kit:terminals:list' as any,
    ) as Pick<DevToolsTerminalSession, 'id' | 'title' | 'status' | 'description'>[]
    renderList(terminalsEl, sessions, t =>
      `<li><strong>${t.title}</strong> <code>${t.id}</code> · ${t.status}</li>`)
  }
  await refreshTerminals()

  setInterval(() => {
    void refreshMessages()
    void refreshTerminals()
  }, 2000)

  // 5. Test the hub:open-path built-in via hub:commands:execute.
  openPathBtn.addEventListener('click', async () => {
    const target = `${location.origin}/README.md`
      .replace(/^https?:\/\/[^/]+/, '') // strip origin, leave path
    try {
      // Use the project README — server has the actual filesystem path.
      const result = await rpc.call(
        'hub:commands:execute' as any,
        'hub:open-path',
        target.startsWith('/') ? target.slice(1) : target,
      )
      openPathBtn.textContent = `Opened (returned ${JSON.stringify(result)})`
    }
    catch (err) {
      openPathBtn.textContent = `Error: ${(err as Error).message}`
    }
  })
}

main().catch((err) => {
  setStatus(`Failed: ${(err as Error).message}`, 'error')
  console.error(err)
})
