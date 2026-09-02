import type { DevframeDockEntry, DevframeViewLauncher } from '@devframes/hub/types'
import { connectDevframe } from '@devframes/hub/client'
import { createIframePanes } from 'iframe-pane'
import { iconClass } from './icons'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

const HUB_BASE = '/__hub/'

// Mirror of the launch command's return shape (`storybook:launch:<id>`,
// dispatched over `hub:commands:execute`).
type EnsureResult
  = | { ok: true, kind: 'port', port: number }
    | { ok: true, kind: 'path', url: string }
    | { ok: false, error: string }

type IframeDock = DevframeDockEntry & { type: 'iframe', url: string }
type LauncherDock = DevframeViewLauncher
type Dock = IframeDock | LauncherDock

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

// Every launched dock's iframe is parked here for its whole lifetime - switching
// tabs only mounts/unmounts the pane over `#stage`, so background docks keep
// their state (Storybook's own routing, scroll, etc.) intact.
const panes = createIframePanes({ container: stageEl })
const runtimes = new Map<string, DockRuntime>()
let docks: Dock[] = []
let selectedId: string | null = null
let rpc: Awaited<ReturnType<typeof connectDevframe>>

function setStatus(text: string, kind?: 'ready' | 'error') {
  const dot = kind === 'ready' ? 'bg-success' : kind === 'error' ? 'bg-error' : 'bg-neutral-400'
  connEl.innerHTML = `<span class="inline-block size-1.5 rounded-full shrink-0 ${dot} mr-1.5 align-middle"></span>${text}`
}

function isIframeDock(d: DevframeDockEntry): d is IframeDock {
  return d.type === 'iframe' && typeof (d as { url?: unknown }).url === 'string'
}

function isLauncherDock(d: DevframeDockEntry): d is LauncherDock {
  return d.type === 'launcher'
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

function overlay(html: string) {
  overlayEl.style.display = 'flex'
  overlayEl.innerHTML = `<div class="flex flex-col items-center gap-4 text-center px6 max-w-md">${html}</div>`
}

/** The idle launcher tile: a start button that lazily boots the Storybook. */
function launcherTile(entry: LauncherDock): string {
  const l = entry.launcher
  const cls = iconClass(l.icon ?? entry.icon)
  const glyph = cls ? `<span class="${cls} text-4xl color-active"></span>` : '<span class="i-ph-books-duotone text-4xl op-fade"></span>'
  return `
    ${glyph}
    <div class="text-base font-medium">${l.title}</div>
    ${l.description ? `<div class="text-sm color-muted">${l.description}</div>` : ''}
    <button type="button" data-launch="${entry.id}" class="btn-primary">
      <span class="i-ph-play-duotone"></span>${l.buttonStart ?? 'Start'}
    </button>`
}

function syncPanes() {
  for (const pane of panes.list()) {
    if (pane.id === selectedId)
      pane.mount(stageEl)
    else
      pane.unmount()
  }
}

function errorTile(entry: Dock | undefined, rt: DockRuntime, title: string): string {
  const detail = rt.error ? `<div class="text-xs font-mono op-mute break-words">${rt.error}</div>` : ''
  const retry = entry && isLauncherDock(entry)
    ? `<button type="button" data-launch="${entry.id}" class="btn-action"><span class="i-ph-arrow-clockwise-duotone"></span>Retry</button>`
    : ''
  return `
      <span class="i-ph-warning-duotone text-4xl text-error"></span>
      <div class="text-sm font-medium">Failed to start ${title}</div>
      ${detail}${retry}`
}

// Idle shows the launcher's start tile; starting mirrors the live `digest`
// (the tail of the `storybook dev` output the host streams onto the tile).
function launcherStageTile(entry: LauncherDock, rt: DockRuntime, title: string): string {
  if (rt.status !== 'starting')
    return launcherTile(entry)
  const digest = entry.launcher.digest
  const digestLine = digest ? `<div class="text-xs font-mono op-mute break-words">${digest}</div>` : ''
  return `
        <span class="i-ph-circle-notch animate-spin text-3xl color-active"></span>
        <div class="text-sm font-medium">Starting ${title}…</div>
        ${digestLine}
        <button type="button" data-terminals class="btn-action text-xs"><span class="i-ph-terminal-window-duotone"></span>Watch output in Terminals</button>`
}

function updateStage() {
  syncPanes()

  if (!selectedId) {
    overlay('<span class="i-ph-books-duotone text-3xl op-fade"></span><div class="text-sm font-medium">No dock selected</div>')
    return
  }

  const entry = docks.find(d => d.id === selectedId)
  const rt = runtimeFor(selectedId)
  const title = entry?.title ?? selectedId

  // A launched pane is mounted - hide the overlay and show the live iframe.
  if (rt.status === 'ready' && panes.has(selectedId)) {
    overlayEl.style.display = 'none'
    return
  }

  if (rt.status === 'error') {
    overlay(errorTile(entry, rt, title))
    return
  }

  if (entry && isLauncherDock(entry)) {
    overlay(launcherStageTile(entry, rt, title))
    return
  }

  // A plain iframe dock (the live terminals plugin) is still booting.
  overlay(`<span class="i-ph-circle-notch animate-spin text-3xl color-active"></span><div class="text-sm font-medium">Loading ${title}…</div>`)
}

/** Resolve the URL an EnsureResult points at (spawned dev port, or static path). */
function resultUrl(result: Extract<EnsureResult, { ok: true }>): string {
  return result.kind === 'path'
    ? result.url
    : `${location.protocol}//${location.hostname}:${result.port}/`
}

function embedIframe(entry: Dock, url: string) {
  const rt = runtimeFor(entry.id)
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
}

/** Launch a Storybook: dispatch its bound command, then iframe the result. */
function launch(entry: LauncherDock) {
  const rt = runtimeFor(entry.id)
  rt.status = 'starting'
  rt.error = undefined
  updateStage()

  const command = entry.launcher.command
  const dispatch = command
    ? rpc.call('hub:commands:execute' as any, command) as Promise<EnsureResult>
    : Promise.reject(new Error('Launcher has no bound command'))

  dispatch
    .then((result) => {
      if (!result.ok)
        throw new Error(result.error)
      embedIframe(entry, resultUrl(result))
    })
    .catch((err: Error) => {
      rt.status = 'error'
      rt.error = err.message
      updateStage()
    })
}

/** A plain iframe dock (the live terminals plugin) mounts its URL directly. */
function openIframe(entry: IframeDock) {
  const rt = runtimeFor(entry.id)
  if (rt.status !== 'idle')
    return
  rt.status = 'starting'
  embedIframe(entry, entry.url)
}

async function main() {
  setStatus('Connecting…')
  rpc = await connectDevframe({ baseURL: HUB_BASE })
  setStatus(`Connected · backend=${rpc.connectionMeta.backend}`, 'ready')

  const switchTo = (id: string) => {
    const entry = docks.find(d => d.id === id)
    if (!entry)
      return
    selectedId = id
    renderSidebar()
    // Plain iframe docks open on select; launcher docks wait for their Start
    // button (the lazy trigger) - so opening a Storybook dock doesn't spawn it.
    if (isIframeDock(entry))
      openIframe(entry)
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

  // Docks - read from `devframe:docks` shared state, keeping launcher (Storybook)
  // and iframe (live plugin) entries.
  const docksState = await rpc.sharedState.get<DevframeDockEntry[]>('devframe:docks', { initialValue: [] })
  const syncDocks = () => {
    docks = (docksState.value() ?? []).filter((d): d is Dock => isIframeDock(d) || isLauncherDock(d))
    if (selectedId && !docks.some(d => d.id === selectedId))
      selectedId = null
    if (!selectedId && docks.length)
      selectedId = docks[0].id
    renderSidebar()
    // Auto-open plain iframe docks (terminals plugin); launcher docks stay idle
    // until the user starts them.
    const entry = selectedId ? docks.find(d => d.id === selectedId) : undefined
    if (entry && isIframeDock(entry) && runtimeFor(entry.id).status === 'idle')
      openIframe(entry)
    updateStage()
  }
  docksState.on('updated', syncDocks)

  docksEl.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-dock-id]')
    if (target?.dataset.dockId)
      switchTo(target.dataset.dockId)
  })

  overlayEl.addEventListener('click', (event) => {
    const el = event.target as HTMLElement
    const launchId = el.closest<HTMLButtonElement>('button[data-launch]')?.dataset.launch
    if (launchId) {
      const entry = docks.find(d => d.id === launchId)
      if (entry && isLauncherDock(entry))
        launch(entry)
      return
    }
    if (el.closest('button[data-terminals]')) {
      // Jump to the live terminals plugin to watch the spawned dev server stream.
      const terminals = docks.find(d => isIframeDock(d) && (d.category ?? '') === 'Plugins')
      if (terminals)
        switchTo(terminals.id)
    }
  })

  syncDocks()
}

main().catch((err) => {
  setStatus(`Failed: ${(err as Error).message}`, 'error')
  console.error(err)
})
