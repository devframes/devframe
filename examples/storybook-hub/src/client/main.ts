import type { DevframeDockEntry } from '@devframes/hub/types'
import { connectDevframe } from '@devframes/hub/client'
import { createIframePanes } from 'iframe-pane'
import { iconClass } from './icons'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

const HUB_BASE = '/__hub/'

// Mirror of the host's `storybook-hub:ensure` return shape.
type EnsureResult
  = | { ok: true, kind: 'port', port: number }
    | { ok: true, kind: 'path', url: string }
    | { ok: false, error: string }

type IframeDock = DevframeDockEntry & { type: 'iframe', url: string }

/** Sidebar section order; anything else follows alphabetically. */
const CATEGORY_ORDER = ['Storybooks', 'Plugins']

const connEl = document.querySelector<HTMLElement>('#conn')!
const docksEl = document.querySelector<HTMLElement>('#docks')!
const stageEl = document.querySelector<HTMLElement>('#stage')!
const overlayEl = document.querySelector<HTMLElement>('#overlay')!

interface DockRuntime {
  status: 'idle' | 'starting' | 'ready' | 'error'
  error?: string
}

// Every opened dock's iframe is parked here for its whole lifetime — switching
// tabs only mounts/unmounts the pane over `#stage`, so background docks keep
// their state (Storybook's own routing, scroll, etc.) intact.
const panes = createIframePanes({ container: stageEl })
const runtimes = new Map<string, DockRuntime>()
let docks: IframeDock[] = []
let selectedId: string | null = null

function setStatus(text: string, kind?: 'ready' | 'error') {
  const dot = kind === 'ready' ? 'bg-success' : kind === 'error' ? 'bg-error' : 'bg-neutral-400'
  connEl.innerHTML = `<span class="inline-block size-1.5 rounded-full shrink-0 ${dot} mr-1.5 align-middle"></span>${text}`
}

function isIframeDock(d: DevframeDockEntry): d is IframeDock {
  return d.type === 'iframe' && typeof (d as { url?: unknown }).url === 'string'
}

function isStorybookDock(id: string): boolean {
  return id.startsWith('sb-')
}

function runtimeFor(id: string): DockRuntime {
  let rt = runtimes.get(id)
  if (!rt) {
    rt = { status: 'idle' }
    runtimes.set(id, rt)
  }
  return rt
}

function dockIcon(entry: DevframeDockEntry): string {
  const cls = iconClass(entry.icon)
  if (cls)
    return `<span class="${cls} shrink-0 text-lg"></span>`
  const initial = (entry.title?.[0] ?? '?').toUpperCase()
  return `<span class="grid h-5 w-5 shrink-0 place-items-center rounded bg-active text-[0.7rem] font-bold">${initial}</span>`
}

function overlay(kind: 'spin' | 'error' | 'idle', title: string, detail = '') {
  const glyph = kind === 'spin'
    ? '<span class="i-ph-circle-notch animate-spin text-3xl color-active"></span>'
    : kind === 'error'
      ? '<span class="i-ph-warning-duotone text-3xl text-error"></span>'
      : '<span class="i-ph-books-duotone text-3xl op-fade"></span>'
  overlayEl.style.display = 'flex'
  overlayEl.innerHTML = `<div class="flex flex-col items-center gap-3 text-center px6">${glyph}<div class="text-sm font-medium">${title}</div>${detail ? `<div class="text-xs font-mono op-mute max-w-md break-words">${detail}</div>` : ''}</div>`
}

function updateStage() {
  for (const pane of panes.list()) {
    if (pane.id === selectedId)
      pane.mount(stageEl)
    else
      pane.unmount()
  }

  if (!selectedId) {
    overlay('idle', 'No dock selected')
    return
  }
  const rt = runtimes.get(selectedId)
  const title = docks.find(d => d.id === selectedId)?.title ?? selectedId
  if (!rt || rt.status === 'starting' || (rt.status !== 'error' && !panes.has(selectedId))) {
    overlay('spin', isStorybookDock(selectedId) ? `Starting ${title} Storybook…` : `Loading ${title}…`)
    return
  }
  if (rt.status === 'error') {
    overlay('error', `Failed to start ${title}`, rt.error)
    return
  }
  overlayEl.style.display = 'none'
}

async function ensureUrl(rpc: Awaited<ReturnType<typeof connectDevframe>>, entry: IframeDock): Promise<string> {
  // Live plugin docks already carry a hub-served URL; only Storybook docks are
  // resolved on demand (spawned in dev, static in build).
  if (!isStorybookDock(entry.id))
    return entry.url

  const result = await rpc.call('storybook-hub:ensure' as any, { id: entry.id.slice(3) }) as EnsureResult
  if (!result.ok)
    throw new Error(result.error)
  return result.kind === 'path'
    ? result.url
    : `${location.protocol}//${location.hostname}:${result.port}/`
}

function initDock(rpc: Awaited<ReturnType<typeof connectDevframe>>, entry: IframeDock) {
  const rt = runtimeFor(entry.id)
  if (rt.status !== 'idle')
    return
  rt.status = 'starting'
  updateStage()

  ensureUrl(rpc, entry)
    .then((url) => {
      panes.ensure(entry.id, {
        src: url,
        attrs: { title: entry.title, allow: 'clipboard-read; clipboard-write' },
        style: { border: '0' },
        onCreated: (iframe) => {
          iframe.addEventListener('load', () => {
            rt.status = 'ready'
            updateStage()
          })
        },
      })
      updateStage()
    })
    .catch((err: Error) => {
      rt.status = 'error'
      rt.error = err.message
      updateStage()
    })
}

async function main() {
  setStatus('Connecting…')
  const rpc = await connectDevframe({ baseURL: HUB_BASE })
  setStatus(`Connected · backend=${rpc.connectionMeta.backend}`, 'ready')

  const switchTo = (id: string) => {
    if (!docks.some(d => d.id === id))
      return
    selectedId = id
    renderSidebar()
    const rt = runtimeFor(id)
    if (rt.status === 'idle')
      initDock(rpc, docks.find(d => d.id === id)!)
    updateStage()
  }

  function renderSidebar() {
    if (!docks.length) {
      docksEl.innerHTML = '<li class="op-mute px2 text-sm">No docks yet…</li>'
      return
    }
    const categories = [...new Set(docks.map(d => d.category ?? 'Other'))].sort(
      (a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a)
        const ib = CATEGORY_ORDER.indexOf(b)
        return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib) || a.localeCompare(b)
      },
    )
    docksEl.innerHTML = categories.map((category) => {
      const items = docks.filter(d => (d.category ?? 'Other') === category)
      const buttons = items.map(d =>
        `<li><button type="button" data-dock-id="${d.id}" class="relative inline-flex items-center gap-2.5 w-full px-2 py-1 rounded-md border border-transparent text-sm op-fade select-none cursor-pointer transition hover:op100 hover:bg-active${d.id === selectedId ? ' op100! bg-active border-base! color-base' : ''}" title="${d.title}">${dockIcon(d)}<span class="truncate">${d.title}</span></button></li>`).join('')
      return `<li class="px2 pt2 pb1 text-[0.68rem] uppercase tracking-wider color-muted">${category}</li>${buttons}`
    }).join('')
  }

  // Docks — read from `devframe:docks` shared state.
  const docksState = await rpc.sharedState.get<DevframeDockEntry[]>('devframe:docks', { initialValue: [] })
  const syncDocks = () => {
    docks = (docksState.value() ?? []).filter(isIframeDock)
    if (selectedId && !docks.some(d => d.id === selectedId))
      selectedId = null
    if (!selectedId && docks.length)
      selectedId = docks[0].id
    renderSidebar()
    if (selectedId) {
      const rt = runtimeFor(selectedId)
      if (rt.status === 'idle')
        initDock(rpc, docks.find(d => d.id === selectedId)!)
    }
    updateStage()
  }
  docksState.on('updated', syncDocks)

  docksEl.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-dock-id]')
    if (target?.dataset.dockId)
      switchTo(target.dataset.dockId)
  })
  syncDocks()
}

main().catch((err) => {
  setStatus(`Failed: ${(err as Error).message}`, 'error')
  console.error(err)
})
