import type { DevframeDockEntry } from '@devframes/hub/types'
import { connectDevframe, createDevframeClientHost } from '@devframes/hub/client'
import { mountAppUnderTest } from './app-under-test'
import { iconClass } from './icons'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

const HUB_BASE = '/__hub/'

const connEl = document.querySelector<HTMLElement>('#conn')!
const docksEl = document.querySelector<HTMLElement>('#docks')!
const stageEl = document.querySelector<HTMLElement>('#dock-stage')!
const appEl = document.querySelector<HTMLElement>('#app-under-test')!

function setStatus(text: string, kind?: 'ready' | 'error') {
  const dot = kind === 'ready' ? 'bg-success' : kind === 'error' ? 'bg-error' : 'bg-neutral-400'
  connEl.innerHTML = `<span class="inline-block size-1.5 rounded-full shrink-0 ${dot} mr-1.5 align-middle"></span>${text}`
}

function dockIcon(entry: DevframeDockEntry): string {
  const cls = iconClass(typeof entry.icon === 'string' ? entry.icon : undefined)
  if (cls)
    return `<span class="${cls} shrink-0 text-lg"></span>`
  const initial = (entry.title?.[0] ?? '?').toUpperCase()
  return `<span class="grid h-5 w-5 shrink-0 place-items-center rounded bg-active text-[0.7rem] font-bold">${initial}</span>`
}

function isIframeDock(d: DevframeDockEntry): d is DevframeDockEntry & { type: 'iframe', url: string } {
  return d.type === 'iframe' && typeof (d as { url?: unknown }).url === 'string'
}

async function main() {
  setStatus('Connecting…')

  // The app under test renders immediately — it's plain page content the a11y
  // agent (imported below as the a11y dock's client script) will scan.
  mountAppUnderTest(appEl)

  const rpc = await connectDevframe({ baseURL: HUB_BASE })
  setStatus(`Connected · backend=${rpc.connectionMeta.backend}`, 'ready')

  // Boot the hub client runtime: it publishes the shared client context and
  // imports each dock's client script into this page — here, the a11y agent,
  // which then scans this document live and mirrors findings into the messages
  // feed. The rail below reads the same `devframe:docks` shared state.
  const host = await createDevframeClientHost({ rpc })
  const docksCtx = host.context.docks

  const docks = await rpc.sharedState.get<DevframeDockEntry[]>('devframe:docks', { initialValue: [] })

  // Keep-alive iframe pool: one iframe per dock, toggled by visibility so the
  // a11y panel keeps its BroadcastChannel connection while you switch docks.
  const iframePool = new Map<string, HTMLIFrameElement>()

  function ensureIframe(entry: DevframeDockEntry & { url: string }): HTMLIFrameElement {
    let el = iframePool.get(entry.id)
    if (!el) {
      el = document.createElement('iframe')
      el.title = entry.title
      el.className = 'absolute inset-0 block h-full w-full border-0 bg-base'
      el.hidden = true
      el.src = entry.url
      stageEl.appendChild(el)
      iframePool.set(entry.id, el)
      const state = docksCtx.getStateById(entry.id)
      if (state) {
        state.domElements.iframe = el
        state.events.emit('dom:iframe:mounted', el)
      }
    }
    return el
  }

  function showSelection(list: DevframeDockEntry[]): void {
    const entry = docksCtx.selectedId ? list.find(d => d.id === docksCtx.selectedId) ?? null : null
    const active = entry && isIframeDock(entry) ? ensureIframe(entry) : null
    for (const el of iframePool.values()) el.hidden = el !== active
  }

  const wired = new Set<string>()
  function render(): void {
    const list = docksCtx.entries.filter(isIframeDock)

    if (!docksCtx.selectedId && list.length > 0)
      void docksCtx.switchEntry(list[0]!.id)

    for (const entry of list) {
      if (wired.has(entry.id))
        continue
      const state = docksCtx.getStateById(entry.id)
      if (!state)
        continue
      wired.add(entry.id)
      state.events.on('entry:activated', render)
    }

    if (!list.length) {
      docksEl.innerHTML = '<li class="op-mute px2 text-sm">Waiting for docks…</li>'
      showSelection(list)
      return
    }

    docksEl.innerHTML = list.map(d =>
      `<li><button type="button" data-dock-id="${d.id}" title="${d.title}"
         class="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md border border-transparent text-sm op-fade select-none cursor-pointer transition hover:op100 hover:bg-active${d.id === docksCtx.selectedId ? ' op100! bg-active border-base! color-base' : ''}">${dockIcon(d)}<span class="truncate">${d.title}</span></button></li>`,
    ).join('')

    showSelection(list)
  }

  docksEl.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-dock-id]')
    if (!target)
      return
    const id = target.dataset.dockId
    if (!id || id === docksCtx.selectedId)
      return
    void docksCtx.switchEntry(id)
  })

  docks.on('updated', render)
  render()
}

main().catch((err) => {
  setStatus(`Failed: ${(err as Error).message}`, 'error')
  console.error(err)
})
