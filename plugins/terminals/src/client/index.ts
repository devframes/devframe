import type { DevframeRpcClient } from 'devframe/client'
import type { StreamReader } from 'devframe/utils/streaming-channel'
import type { TerminalPreset, TerminalSessionInfo, TerminalsSharedState } from '../types'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { connectDevframe } from 'devframe/client'
import { PRESETS_STATE_KEY, SESSIONS_STATE_KEY, TERMINAL_STREAM_CHANNEL } from '../constants'
import { XTERM_CSS } from './xterm-css'

export interface MountTerminalsOptions {
  /** Pre-connected client. When omitted, `connectDevframe()` is awaited. */
  rpc?: DevframeRpcClient
  /**
   * Auto-create an interactive shell when no session exists yet.
   * @default true
   */
  autostart?: boolean
}

export interface TerminalsHandle {
  rpc: DevframeRpcClient
  dispose: () => void
}

interface SessionView {
  info: TerminalSessionInfo
  term: Terminal
  fit: FitAddon
  reader: StreamReader<string>
  el: HTMLDivElement
  tab: HTMLButtonElement
}

const UI_CSS = `
.dft-root { position: absolute; inset: 0; display: flex; flex-direction: column;
  font-family: system-ui, sans-serif; background: #0b0e14; color: #c9d1d9; }
.dft-header { display: flex; align-items: stretch; gap: 4px; padding: 6px 8px;
  border-bottom: 1px solid #1c2128; background: #0d1117; }
.dft-tabs { display: flex; gap: 4px; overflow-x: auto; flex: 1; align-items: center; }
.dft-tab { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
  padding: 4px 10px; border-radius: 6px; border: 1px solid transparent; background: #161b22;
  color: #8b949e; font-size: 12px; cursor: pointer; }
.dft-tab:hover { color: #c9d1d9; }
.dft-tab.active { background: #21262d; color: #fff; border-color: #30363d; }
.dft-dot { width: 7px; height: 7px; border-radius: 50%; background: #3fb950; flex: none; }
.dft-dot.exited { background: #6e7681; }
.dft-dot.error { background: #f85149; }
.dft-actions { display: flex; gap: 6px; align-items: center; }
.dft-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid #30363d;
  background: #21262d; color: #c9d1d9; font-size: 12px; cursor: pointer; }
.dft-btn:hover { background: #30363d; }
.dft-btn:disabled { opacity: 0.45; cursor: default; }
.dft-select { padding: 4px 8px; border-radius: 6px; border: 1px solid #30363d;
  background: #21262d; color: #c9d1d9; font-size: 12px; }
.dft-toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 10px;
  border-bottom: 1px solid #1c2128; font-size: 12px; color: #8b949e; min-height: 20px; }
.dft-badge { padding: 1px 7px; border-radius: 10px; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.03em; border: 1px solid #30363d; }
.dft-badge.interactive { color: #58a6ff; border-color: #1f6feb55; }
.dft-badge.readonly { color: #d29922; border-color: #9e6a0355; }
.dft-spacer { flex: 1; }
.dft-body { position: relative; flex: 1; overflow: hidden; background: #000; }
.dft-view { position: absolute; inset: 0; padding: 4px; display: none; }
.dft-view.active { display: block; }
.dft-empty { position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; color: #6e7681; font-size: 13px; pointer-events: none; }
.dft-view .xterm, .dft-view .xterm-viewport, .dft-view .xterm-screen { height: 100%; }
.dft-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #c9d1d9; }
`

const THEME = {
  background: '#000000',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  selectionBackground: '#234876',
}

let stylesInjected = false
function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined')
    return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = XTERM_CSS + UI_CSS
  document.head.appendChild(style)
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className)
    node.className = className
  return node
}

/**
 * Mount the xterm-powered terminals UI into `container`. Renders one tab +
 * xterm instance per session, streams output from the
 * `devframes-plugin-terminals:output` channel, forwards keystrokes/resize for
 * interactive sessions, and disables input for readonly ones.
 *
 * Usable both by the standalone SPA and as a hub `custom-render` renderer.
 */
export async function mountTerminals(
  container: HTMLElement,
  options: MountTerminalsOptions = {},
): Promise<TerminalsHandle> {
  injectStyles()
  const rpc = options.rpc ?? (await connectDevframe()) as unknown as DevframeRpcClient

  const root = el('div', 'dft-root')
  const header = el('div', 'dft-header')
  const tabs = el('div', 'dft-tabs')
  const actions = el('div', 'dft-actions')
  const presetSelect = el('select', 'dft-select')
  const newShellBtn = el('button', 'dft-btn')
  newShellBtn.textContent = '+ Shell'
  actions.append(presetSelect, newShellBtn)
  header.append(tabs, actions)

  const toolbar = el('div', 'dft-toolbar')
  const body = el('div', 'dft-body')
  const empty = el('div', 'dft-empty')
  empty.textContent = 'No terminal sessions — start one above.'
  body.append(empty)

  root.append(header, toolbar, body)
  container.append(root)

  const views = new Map<string, SessionView>()
  let activeId: string | null = null
  let presets: TerminalPreset[] = []
  let disposed = false

  function spawn(req: Parameters<DevframeRpcClient['call']>[1]): void {
    rpc.call('devframes-plugin-terminals:spawn', req as any).catch(() => {})
  }

  newShellBtn.onclick = () => spawn({ mode: 'interactive' })

  presetSelect.onchange = () => {
    const id = presetSelect.value
    presetSelect.value = ''
    if (id)
      spawn({ presetId: id })
  }

  function renderPresets(): void {
    presetSelect.replaceChildren()
    const placeholder = el('option')
    placeholder.value = ''
    placeholder.textContent = presets.length ? 'Run preset…' : 'No presets'
    presetSelect.append(placeholder)
    presetSelect.disabled = presets.length === 0
    for (const preset of presets) {
      const opt = el('option')
      opt.value = preset.id
      opt.textContent = preset.title
      presetSelect.append(opt)
    }
  }

  function fitActive(): void {
    if (!activeId)
      return
    const view = views.get(activeId)
    if (!view)
      return
    try {
      view.fit.fit()
    }
    catch {
      // Container not measurable yet.
    }
  }

  function setActive(id: string | null): void {
    activeId = id
    for (const [vid, view] of views) {
      const active = vid === id
      view.el.classList.toggle('active', active)
      view.tab.classList.toggle('active', active)
      if (active) {
        requestAnimationFrame(() => {
          fitActive()
          view.term.focus()
        })
      }
    }
    renderToolbar()
  }

  function renderToolbar(): void {
    toolbar.replaceChildren()
    const view = activeId ? views.get(activeId) : undefined
    if (!view)
      return
    const { info } = view

    const badge = el('span', `dft-badge ${info.mode}`)
    badge.textContent = info.mode
    const label = el('span', 'dft-mono')
    label.textContent = `${info.command}${info.args.length ? ` ${info.args.join(' ')}` : ''}`
    const status = el('span')
    status.textContent = info.status === 'running'
      ? `running · ${info.backend}${info.pid ? ` · pid ${info.pid}` : ''}`
      : `${info.status}${info.exitCode != null ? ` (${info.exitCode})` : ''}`

    const spacer = el('div', 'dft-spacer')

    const restartBtn = el('button', 'dft-btn')
    restartBtn.textContent = 'Restart'
    restartBtn.onclick = () => rpc.call('devframes-plugin-terminals:restart', { id: info.id }).catch(() => {})

    const clearBtn = el('button', 'dft-btn')
    clearBtn.textContent = 'Clear'
    clearBtn.onclick = () => view.term.clear()

    const killBtn = el('button', 'dft-btn')
    killBtn.textContent = 'Kill'
    killBtn.onclick = () => rpc.call('devframes-plugin-terminals:remove', { id: info.id }).catch(() => {})

    toolbar.append(badge, label, status, spacer, restartBtn, clearBtn, killBtn)
  }

  function createView(info: TerminalSessionInfo): SessionView {
    const viewEl = el('div', 'dft-view')
    body.append(viewEl)

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      scrollback: 10000,
      theme: THEME,
      disableStdin: info.mode !== 'interactive',
      allowProposedApi: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(viewEl)

    if (info.mode === 'interactive') {
      term.onData((data) => {
        rpc.call('devframes-plugin-terminals:write', { id: info.id, data }).catch(() => {})
      })
    }
    term.onResize(({ cols, rows }) => {
      rpc.call('devframes-plugin-terminals:resize', { id: info.id, cols, rows }).catch(() => {})
    })

    const reader = rpc.streaming.subscribe<string>(TERMINAL_STREAM_CHANNEL, info.id)
    ;(async () => {
      try {
        for await (const chunk of reader)
          term.write(chunk)
      }
      catch {
        // Stream ended/errored; the session view stays for scrollback.
      }
    })()

    const tab = el('button', 'dft-tab')
    tab.onclick = () => setActive(info.id)

    requestAnimationFrame(() => {
      try {
        fit.fit()
      }
      catch {}
    })

    return { info, term, fit, reader, el: viewEl, tab }
  }

  function disposeView(view: SessionView): void {
    view.reader.cancel()
    view.term.dispose()
    view.el.remove()
    view.tab.remove()
  }

  function renderTabs(): void {
    for (const view of views.values()) {
      view.tab.replaceChildren()
      const dot = el('span', `dft-dot ${view.info.status === 'running' ? '' : view.info.status}`)
      const label = el('span')
      label.textContent = view.info.title
      view.tab.append(dot, label)
      if (view.tab.parentElement !== tabs)
        tabs.append(view.tab)
    }
  }

  function syncSessions(sessions: TerminalSessionInfo[]): void {
    if (disposed)
      return
    const seen = new Set<string>()
    for (const info of sessions) {
      seen.add(info.id)
      const existing = views.get(info.id)
      if (existing) {
        existing.info = info
      }
      else {
        views.set(info.id, createView(info))
      }
    }
    for (const [id, view] of views) {
      if (!seen.has(id)) {
        disposeView(view)
        views.delete(id)
      }
    }

    empty.style.display = views.size ? 'none' : 'flex'

    if (activeId && !views.has(activeId))
      activeId = null
    if (!activeId && views.size)
      activeId = sessions[sessions.length - 1]?.id ?? views.keys().next().value ?? null

    renderTabs()
    setActive(activeId)
    renderToolbar()
  }

  // Bind shared state for sessions + presets.
  const sessionsState = await rpc.sharedState.get(SESSIONS_STATE_KEY, {
    initialValue: { sessions: [] } as TerminalsSharedState,
  })
  const presetsState = await rpc.sharedState.get(PRESETS_STATE_KEY, {
    initialValue: { presets: [] } as { presets: TerminalPreset[] },
  })

  presets = (presetsState.value() as { presets: TerminalPreset[] }).presets ?? []
  renderPresets()
  const offPresets = presetsState.on('updated', (full: { presets: TerminalPreset[] }) => {
    presets = full.presets ?? []
    renderPresets()
  })

  syncSessions((sessionsState.value() as TerminalsSharedState).sessions ?? [])
  const offSessions = sessionsState.on('updated', (full: TerminalsSharedState) => {
    syncSessions(full.sessions ?? [])
  })

  // Auto-create an interactive shell when nothing is running yet.
  if (options.autostart !== false && views.size === 0)
    spawn({ mode: 'interactive' })

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => fitActive())
    : undefined
  resizeObserver?.observe(body)

  return {
    rpc,
    dispose() {
      disposed = true
      offSessions?.()
      offPresets?.()
      resizeObserver?.disconnect()
      for (const view of views.values())
        disposeView(view)
      views.clear()
      root.remove()
    },
  }
}

export { TERMINAL_STREAM_CHANNEL } from '../constants'
export type { TerminalPreset, TerminalSessionInfo } from '../types'
