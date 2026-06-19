import type { ITheme } from '@xterm/xterm'
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
  font-family: system-ui, sans-serif; background: var(--dft-bg); color: var(--dft-fg); }
.dft-root.dft-dark {
  --dft-bg: #0d1117; --dft-fg: #c9d1d9; --dft-muted: #8b949e;
  --dft-border: #1c2128; --dft-surface: #161b22; --dft-surface-hover: #30363d;
  --dft-surface-active: #21262d; --dft-term-bg: #000000; --dft-accent: #58a6ff;
}
.dft-root.dft-light {
  --dft-bg: #f6f8fa; --dft-fg: #1f2328; --dft-muted: #59636e;
  --dft-border: #d0d7de; --dft-surface: #ffffff; --dft-surface-hover: #eaeef2;
  --dft-surface-active: #ffffff; --dft-term-bg: #ffffff; --dft-accent: #0969da;
}
.dft-header { display: flex; align-items: stretch; gap: 4px; padding: 6px 8px;
  border-bottom: 1px solid var(--dft-border); background: var(--dft-bg); }
.dft-tabs { display: flex; gap: 4px; overflow-x: auto; flex: 1; align-items: center; }
.dft-tab { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
  padding: 4px 10px; border-radius: 6px; border: 1px solid transparent; background: var(--dft-surface);
  color: var(--dft-muted); font-size: 12px; cursor: pointer; }
.dft-tab:hover { color: var(--dft-fg); }
.dft-tab.active { background: var(--dft-surface-active); color: var(--dft-fg); border-color: var(--dft-border); }
.dft-newtab { min-width: 28px; justify-content: center; font-weight: 600; font-size: 14px; flex: none; }
.dft-dot { width: 7px; height: 7px; border-radius: 50%; background: #3fb950; flex: none; }
.dft-dot.exited { background: #6e7681; }
.dft-dot.error { background: #f85149; }
.dft-actions { display: flex; gap: 6px; align-items: center; }
.dft-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--dft-border);
  background: var(--dft-surface); color: var(--dft-fg); font-size: 12px; cursor: pointer; }
.dft-btn:hover { background: var(--dft-surface-hover); }
.dft-btn:disabled { opacity: 0.45; cursor: default; }
.dft-select { padding: 4px 8px; border-radius: 6px; border: 1px solid var(--dft-border);
  background: var(--dft-surface); color: var(--dft-fg); font-size: 12px; }
.dft-rename { font: inherit; font-size: 12px; width: 10ch; min-width: 64px; padding: 1px 5px;
  border: 1px solid var(--dft-accent); border-radius: 4px; background: var(--dft-bg);
  color: var(--dft-fg); outline: none; }
.dft-toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 10px;
  border-bottom: 1px solid var(--dft-border); font-size: 12px; color: var(--dft-muted); min-height: 20px; }
.dft-badge { padding: 1px 7px; border-radius: 10px; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.03em; border: 1px solid var(--dft-border); }
.dft-badge.interactive { color: var(--dft-accent); border-color: #1f6feb55; }
.dft-badge.readonly { color: #bb8009; border-color: #9e6a0355; }
.dft-spacer { flex: 1; }
.dft-body { position: relative; flex: 1; overflow: hidden; background: var(--dft-term-bg); }
.dft-view { position: absolute; inset: 0; padding: 4px; display: none; }
.dft-view.active { display: block; }
.dft-empty { position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; color: var(--dft-muted); font-size: 13px; pointer-events: none; }
.dft-view .xterm, .dft-view .xterm-viewport, .dft-view .xterm-screen { height: 100%; }
.dft-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dft-fg); }
`

const DARK_THEME: ITheme = {
  background: '#000000',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  cursorAccent: '#000000',
  selectionBackground: '#234876',
}

// GitHub-light palette so the default-bright ANSI colors stay legible on white.
const LIGHT_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#0969da',
  cursorAccent: '#ffffff',
  selectionBackground: '#b6d7ff',
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#7d4e00',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#633c01',
  brightBlue: '#218bff',
  brightMagenta: '#a475f9',
  brightCyan: '#3192aa',
  brightWhite: '#8c959f',
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
  actions.append(presetSelect)
  header.append(tabs, actions)

  // The "new terminal" affordance sits at the end of the tab strip.
  const newTabBtn = el('button', 'dft-tab dft-newtab')
  newTabBtn.textContent = '+'
  newTabBtn.title = 'New terminal'

  const toolbar = el('div', 'dft-toolbar')
  const body = el('div', 'dft-body')
  const empty = el('div', 'dft-empty')
  empty.textContent = 'No terminal sessions — click + to start one.'
  body.append(empty)

  root.append(header, toolbar, body)
  container.append(root)

  const views = new Map<string, SessionView>()
  let activeId: string | null = null
  let presets: TerminalPreset[] = []
  let disposed = false
  let renamingId: string | null = null
  // Session to select once it shows up in the shared-state list (set when
  // we spawn one and want to focus it on arrival).
  let pendingSelectId: string | null = null

  // Follow the system color mode and react to changes at runtime, switching
  // both the UI chrome (via CSS classes) and every xterm instance's theme.
  const colorScheme = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null
  let isDark = colorScheme ? colorScheme.matches : true

  function activeTheme(): ITheme {
    return isDark ? DARK_THEME : LIGHT_THEME
  }

  function applyColorScheme(): void {
    root.classList.toggle('dft-dark', isDark)
    root.classList.toggle('dft-light', !isDark)
    for (const view of views.values())
      view.term.options.theme = activeTheme()
  }

  const onColorScheme = (e: MediaQueryListEvent): void => {
    isDark = e.matches
    applyColorScheme()
  }
  colorScheme?.addEventListener('change', onColorScheme)
  applyColorScheme()

  /** Tab/toolbar label: custom name wins, then the live process, then the base title. */
  function displayName(info: TerminalSessionInfo): string {
    return info.customTitle || info.processName || info.title
  }

  // Selection is mirrored to the URL hash (e.g. `#id=<sessionId>`) so it
  // survives links and reacts to back/forward + manual edits.
  function readHashId(): string | null {
    if (typeof location === 'undefined')
      return null
    return new URLSearchParams(location.hash.replace(/^#/, '')).get('id')
  }

  function writeHashId(id: string): void {
    if (typeof location === 'undefined' || typeof history === 'undefined')
      return
    const target = `#id=${id}`
    if (location.hash !== target)
      history.replaceState(history.state, '', target)
  }

  const onHashChange = (): void => {
    const id = readHashId()
    if (id && views.has(id) && id !== activeId)
      setActive(id, { updateHash: false })
  }
  if (typeof window !== 'undefined')
    window.addEventListener('hashchange', onHashChange)

  /** Spawn a session and select it as soon as it appears in the list. */
  async function spawnAndSelect(req: Parameters<DevframeRpcClient['call']>[1]): Promise<void> {
    try {
      const info = await rpc.call('devframes-plugin-terminals:spawn', req as any) as { id?: string }
      if (info?.id) {
        pendingSelectId = info.id
        if (views.has(info.id)) {
          pendingSelectId = null
          setActive(info.id)
        }
      }
    }
    catch {
      // Spawn failures surface via server-side diagnostics.
    }
  }

  newTabBtn.onclick = () => void spawnAndSelect({ mode: 'interactive' })

  presetSelect.onchange = () => {
    const id = presetSelect.value
    presetSelect.value = ''
    if (id)
      void spawnAndSelect({ presetId: id })
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

  function setActive(id: string | null, opts: { updateHash?: boolean } = {}): void {
    const changed = activeId !== id
    activeId = id
    for (const [vid, view] of views) {
      const active = vid === id
      view.el.classList.toggle('active', active)
      view.tab.classList.toggle('active', active)
    }
    if (id) {
      if (opts.updateHash !== false)
        writeHashId(id)
      // Only fit + steal focus when the active session actually changed,
      // so background shared-state updates (e.g. process-name polling)
      // don't refocus the terminal every tick.
      if (changed) {
        const view = views.get(id)
        if (view) {
          requestAnimationFrame(() => {
            fitActive()
            view.term.focus()
          })
        }
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
    label.textContent = info.processName && info.processName !== info.command
      ? `${info.processName} · ${info.command}`
      : `${info.command}${info.args.length ? ` ${info.args.join(' ')}` : ''}`
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
      theme: activeTheme(),
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
    tab.ondblclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const view = views.get(info.id)
      if (view)
        startRename(view)
    }

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
      if (view.tab.parentElement !== tabs)
        tabs.append(view.tab)
      // Leave the tab being renamed untouched so its input survives
      // concurrent shared-state updates.
      if (view.info.id === renamingId)
        continue
      view.tab.replaceChildren()
      const dot = el('span', `dft-dot ${view.info.status === 'running' ? '' : view.info.status}`)
      const label = el('span')
      label.textContent = displayName(view.info)
      view.tab.title = 'Double-click to rename'
      view.tab.append(dot, label)
    }
    // Keep the "+" affordance pinned to the end of the strip.
    tabs.append(newTabBtn)
  }

  /** Inline-edit a tab name; commits via the rename RPC on Enter/blur. */
  function startRename(view: SessionView): void {
    renamingId = view.info.id
    const input = el('input', 'dft-rename')
    input.value = displayName(view.info)
    input.spellcheck = false
    view.tab.replaceChildren(input)
    input.focus()
    input.select()

    let settled = false
    const finish = (commit: boolean): void => {
      if (settled)
        return
      settled = true
      renamingId = null
      if (commit) {
        rpc.call('devframes-plugin-terminals:rename', { id: view.info.id, title: input.value.trim() })
          .catch(() => {})
      }
      renderTabs()
    }
    input.onclick = e => e.stopPropagation()
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        finish(true)
      }
      else if (e.key === 'Escape') {
        e.preventDefault()
        finish(false)
      }
    }
    input.onblur = () => finish(true)
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

    if (pendingSelectId && views.has(pendingSelectId)) {
      // A freshly spawned session has arrived — select it.
      activeId = pendingSelectId
      pendingSelectId = null
    }
    else if (!activeId && views.size) {
      // Otherwise honour the URL hash, else fall back to the newest session.
      const hashId = readHashId()
      activeId = (hashId && views.has(hashId))
        ? hashId
        : sessions[sessions.length - 1]?.id ?? views.keys().next().value ?? null
    }

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

  // Reconcile from the authoritative `list` RPC. The shared state resolves
  // with its (empty) initial value and backfills the server's sessions
  // asynchronously, so reading it synchronously here can both miss existing
  // sessions (leaving the panel blank on refresh) and make every reload look
  // empty enough to spawn another shell. Seeding from `list` renders the
  // restored sessions immediately; syncSessions then reselects the URL-hashed
  // one. A new session is started only when none exist.
  let existing: TerminalSessionInfo[] | null = null
  try {
    existing = await rpc.call('devframes-plugin-terminals:list') as TerminalSessionInfo[]
  }
  catch {
    existing = null
  }
  if (existing)
    syncSessions(existing)
  const hasSessions = existing ? existing.length > 0 : views.size > 0
  if (options.autostart !== false && !hasSessions)
    void spawnAndSelect({ mode: 'interactive' })

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
      colorScheme?.removeEventListener('change', onColorScheme)
      if (typeof window !== 'undefined')
        window.removeEventListener('hashchange', onHashChange)
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
