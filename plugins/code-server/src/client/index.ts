import type { DevframeRpcClient } from 'devframe/client'
import type {
  CodeServerAuth,
  CodeServerDetection,
  CodeServerServerInfo,
  CodeServerSharedState,
  CodeServerStatusResult,
} from '../types'
import { connectDevframe } from 'devframe/client'
import { STATE_KEY } from '../constants'

export interface MountCodeServerOptions {
  /** Pre-connected client. When omitted, `connectDevframe()` is awaited. */
  rpc?: DevframeRpcClient
}

export interface CodeServerHandle {
  rpc: DevframeRpcClient
  dispose: () => void
}

const DOCS_URL = 'https://coder.com/docs/code-server/latest/install'
const REPO_URL = 'https://github.com/coder/code-server'

const INSTALL_COMMANDS: { label: string, command: string }[] = [
  { label: 'Install script (Linux / macOS)', command: 'curl -fsSL https://code-server.dev/install.sh | sh' },
  { label: 'npm', command: 'npm install -g code-server' },
  { label: 'Homebrew', command: 'brew install code-server' },
]

const UI_CSS = `
.dcs-root { position: absolute; inset: 0; display: flex; flex-direction: column;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--dcs-bg); color: var(--dcs-fg); overflow: hidden;
  --dcs-bg: #ffffff; --dcs-fg: #1f2328; --dcs-muted: #59636e; --dcs-border: #d0d7de;
  --dcs-surface: #f6f8fa; --dcs-surface-hover: #eaeef2; --dcs-accent: #0969da;
  --dcs-accent-fg: #ffffff; --dcs-ok: #1a7f37; --dcs-err: #cf222e; --dcs-code-bg: #f6f8fa; }
@media (prefers-color-scheme: dark) {
  .dcs-root { --dcs-bg: #0d1117; --dcs-fg: #e6edf3; --dcs-muted: #8b949e; --dcs-border: #30363d;
    --dcs-surface: #161b22; --dcs-surface-hover: #21262d; --dcs-accent: #2f81f7;
    --dcs-accent-fg: #ffffff; --dcs-ok: #3fb950; --dcs-err: #f85149; --dcs-code-bg: #161b22; } }
.dcs-center { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; }
.dcs-card { width: 100%; max-width: 560px; }
.dcs-eyebrow { display: flex; align-items: center; gap: 8px; font-size: 12px; letter-spacing: .04em;
  text-transform: uppercase; color: var(--dcs-muted); margin: 0 0 10px; }
.dcs-title { font-size: 22px; font-weight: 650; margin: 0 0 8px; }
.dcs-lead { font-size: 14px; line-height: 1.55; color: var(--dcs-muted); margin: 0 0 20px; }
.dcs-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px;
  color: var(--dcs-muted); margin: 0 0 20px; }
.dcs-meta code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dcs-fg); }
.dcs-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dcs-btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px;
  font-weight: 550; padding: 8px 16px; border-radius: 7px; border: 1px solid var(--dcs-border);
  background: var(--dcs-surface); color: var(--dcs-fg); cursor: pointer; transition: background .12s; }
.dcs-btn:hover { background: var(--dcs-surface-hover); }
.dcs-btn:disabled { opacity: .55; cursor: default; }
.dcs-btn.primary { background: var(--dcs-accent); color: var(--dcs-accent-fg); border-color: transparent; }
.dcs-btn.primary:hover { filter: brightness(1.07); background: var(--dcs-accent); }
.dcs-link { color: var(--dcs-accent); text-decoration: none; font-size: 13px; }
.dcs-link:hover { text-decoration: underline; }
.dcs-install { display: flex; flex-direction: column; gap: 12px; margin: 0 0 20px; }
.dcs-install-row label { display: block; font-size: 12px; color: var(--dcs-muted); margin: 0 0 4px; }
.dcs-cmd { display: flex; align-items: center; gap: 8px; background: var(--dcs-code-bg);
  border: 1px solid var(--dcs-border); border-radius: 7px; padding: 8px 10px; }
.dcs-cmd code { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px;
  white-space: nowrap; overflow-x: auto; color: var(--dcs-fg); }
.dcs-copy { font: inherit; font-size: 11px; padding: 3px 9px; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--dcs-border); background: var(--dcs-surface); color: var(--dcs-muted); flex: none; }
.dcs-copy:hover { color: var(--dcs-fg); }
.dcs-foot { font-size: 12.5px; color: var(--dcs-muted); margin: 18px 0 0; }
.dcs-error { font-size: 13px; color: var(--dcs-err); background: color-mix(in srgb, var(--dcs-err) 9%, transparent);
  border: 1px solid color-mix(in srgb, var(--dcs-err) 35%, transparent); border-radius: 7px;
  padding: 10px 12px; margin: 0 0 18px; white-space: pre-wrap; word-break: break-word; }
.dcs-spinner { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--dcs-border);
  border-top-color: var(--dcs-accent); animation: dcs-spin .7s linear infinite; }
@keyframes dcs-spin { to { transform: rotate(360deg); } }
.dcs-bar { display: flex; align-items: center; gap: 10px; padding: 6px 10px;
  border-bottom: 1px solid var(--dcs-border); background: var(--dcs-bg); font-size: 12.5px; flex: none; }
.dcs-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dcs-ok); flex: none; }
.dcs-bar-label { font-weight: 600; }
.dcs-bar-meta { color: var(--dcs-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dcs-bar-spacer { flex: 1; }
.dcs-bar .dcs-btn { padding: 4px 10px; font-size: 12px; }
.dcs-frame-wrap { position: relative; flex: 1; min-height: 0; }
.dcs-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--dcs-bg); }
`

let stylesInjected = false
function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined')
    return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = UI_CSS
  document.head.appendChild(style)
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className)
    node.className = className
  if (text != null)
    node.textContent = text
  return node
}

/**
 * Mount the code-server launcher into `container`. Renders one of:
 *  - install instructions when the binary is missing;
 *  - a launch screen when it is installed but stopped;
 *  - a progress state while starting;
 *  - the editor in an auto-authenticated `<iframe>` once running.
 *
 * The connection is assumed already authorized with devframe's auth, so the
 * server-issued session cookie is applied transparently before the iframe
 * loads — the user never sees code-server's login page.
 */
export async function mountCodeServer(
  container: HTMLElement,
  options: MountCodeServerOptions = {},
): Promise<CodeServerHandle> {
  injectStyles()

  const rpc = options.rpc ?? (await connectDevframe())
  if (rpc.connectionMeta.backend === 'websocket')
    await rpc.ensureTrusted(5000).catch(() => {})

  const root = el('div', 'dcs-root')
  container.append(root)

  let detection: CodeServerDetection = { checked: false, installed: false, bin: 'code-server' }
  let server: CodeServerServerInfo = { status: 'stopped' }
  let auth: CodeServerAuth | undefined
  let busy = false
  let frameSrc: string | null = null
  let disposed = false

  function applyResult(result: CodeServerStatusResult): void {
    detection = result.detection
    server = result.server
    if (result.auth)
      auth = result.auth
  }

  function codeServerUrl(port: number): string {
    return `${location.protocol}//${location.hostname}:${port}/`
  }

  /** Sign the iframe in by setting code-server's session cookie for this host. */
  function applyAuthCookie(): void {
    if (!auth)
      return
    document.cookie = `${auth.cookieName}=${auth.cookieValue}; path=/; SameSite=Lax`
  }

  async function call<T>(method: string, ...args: any[]): Promise<T | undefined> {
    try {
      return await rpc.call(method as any, ...args) as T
    }
    catch (error) {
      server = { status: 'error', error: error instanceof Error ? error.message : String(error) }
      return undefined
    }
  }

  async function launch(): Promise<void> {
    if (busy)
      return
    busy = true
    render()
    const result = await call<CodeServerStatusResult>('devframes-plugin-code-server:start', {})
    if (result)
      applyResult(result)
    busy = false
    render()
  }

  async function stop(): Promise<void> {
    if (busy)
      return
    busy = true
    render()
    const result = await call<CodeServerStatusResult>('devframes-plugin-code-server:stop')
    if (result)
      applyResult(result)
    auth = undefined
    frameSrc = null
    busy = false
    render()
  }

  async function recheck(): Promise<void> {
    if (busy)
      return
    busy = true
    render()
    await call('devframes-plugin-code-server:detect')
    busy = false
    render()
  }

  // ---- renderers -----------------------------------------------------------

  function shell(...children: Node[]): void {
    const center = el('div', 'dcs-center')
    const card = el('div', 'dcs-card')
    card.append(...children)
    center.append(card)
    root.replaceChildren(center)
  }

  function renderConnecting(): void {
    const wrap = el('div', 'dcs-actions')
    wrap.append(el('div', 'dcs-spinner'), el('span', 'dcs-lead', 'Connecting to devframe…'))
    shell(wrap)
  }

  function renderNotInstalled(): void {
    const nodes: Node[] = []
    nodes.push(el('p', 'dcs-eyebrow', 'code-server'))
    nodes.push(el('h1', 'dcs-title', 'code-server is not installed'))
    nodes.push(el('p', 'dcs-lead', 'Install code-server (VS Code in the browser) to open the editor here. Pick whichever fits your setup, then re-check.'))

    const install = el('div', 'dcs-install')
    for (const { label, command } of INSTALL_COMMANDS) {
      const row = el('div', 'dcs-install-row')
      row.append(el('label', undefined, label))
      const cmd = el('div', 'dcs-cmd')
      cmd.append(el('code', undefined, command))
      const copy = el('button', 'dcs-copy', 'Copy')
      copy.onclick = () => {
        navigator.clipboard?.writeText(command).then(() => {
          copy.textContent = 'Copied'
          setTimeout(() => {
            copy.textContent = 'Copy'
          }, 1200)
        }).catch(() => {})
      }
      cmd.append(copy)
      row.append(cmd)
      install.append(row)
    }
    nodes.push(install)

    const actions = el('div', 'dcs-actions')
    const recheckBtn = el('button', 'dcs-btn primary', busy ? 'Checking…' : 'Re-check')
    recheckBtn.disabled = busy
    recheckBtn.onclick = recheck
    actions.append(recheckBtn)
    const docs = el('a', 'dcs-link', 'Installation docs ↗') as HTMLAnchorElement
    docs.href = DOCS_URL
    docs.target = '_blank'
    docs.rel = 'noreferrer'
    actions.append(docs)
    const repo = el('a', 'dcs-link', 'GitHub ↗') as HTMLAnchorElement
    repo.href = REPO_URL
    repo.target = '_blank'
    repo.rel = 'noreferrer'
    actions.append(repo)
    nodes.push(actions)
    shell(...nodes)
  }

  function renderLaunch(): void {
    const nodes: Node[] = []
    nodes.push(el('p', 'dcs-eyebrow', 'code-server'))
    nodes.push(el('h1', 'dcs-title', 'Launch the editor'))
    nodes.push(el('p', 'dcs-lead', 'Start a code-server instance scoped to this workspace and open VS Code right here. The server runs with a generated password and the editor is signed in automatically.'))

    if (server.status === 'error' && server.error)
      nodes.push(el('div', 'dcs-error', server.error))

    const meta = el('div', 'dcs-meta')
    if (detection.version) {
      const v = el('span')
      v.append(document.createTextNode('version '), el('code', undefined, detection.version))
      meta.append(v)
    }
    const b = el('span')
    b.append(document.createTextNode('binary '), el('code', undefined, detection.bin))
    meta.append(b)
    nodes.push(meta)

    const actions = el('div', 'dcs-actions')
    const launchBtn = el('button', 'dcs-btn primary')
    if (busy)
      launchBtn.append(el('span', 'dcs-spinner'), document.createTextNode('Starting…'))
    else
      launchBtn.textContent = 'Launch code-server'
    launchBtn.disabled = busy
    launchBtn.onclick = launch
    actions.append(launchBtn)
    nodes.push(actions)
    shell(...nodes)
  }

  function renderStarting(): void {
    const wrap = el('div', 'dcs-actions')
    wrap.append(el('div', 'dcs-spinner'), el('span', 'dcs-lead', 'Starting code-server…'))
    shell(wrap)
  }

  function renderRunning(): void {
    const port = server.port
    if (port == null) {
      renderLaunch()
      return
    }
    const url = codeServerUrl(port)
    applyAuthCookie()

    const bar = el('div', 'dcs-bar')
    bar.append(el('span', 'dcs-dot'))
    bar.append(el('span', 'dcs-bar-label', 'code-server'))
    bar.append(el('span', 'dcs-bar-meta', new URL(url).host))
    bar.append(el('div', 'dcs-bar-spacer'))

    const openBtn = el('button', 'dcs-btn', 'Open in new tab')
    openBtn.onclick = () => window.open(url, '_blank', 'noreferrer')
    bar.append(openBtn)

    const reloadBtn = el('button', 'dcs-btn', 'Reload')
    bar.append(reloadBtn)

    const stopBtn = el('button', 'dcs-btn', busy ? 'Stopping…' : 'Stop')
    stopBtn.disabled = busy
    stopBtn.onclick = stop
    bar.append(stopBtn)

    const frameWrap = el('div', 'dcs-frame-wrap')
    const frame = el('iframe', 'dcs-frame') as HTMLIFrameElement
    frame.setAttribute('allow', 'clipboard-read; clipboard-write; cross-origin-isolated')
    frame.src = url
    frameSrc = url
    reloadBtn.onclick = () => {
      applyAuthCookie()
      frame.src = url
    }
    frameWrap.append(frame)

    root.replaceChildren(bar, frameWrap)
  }

  function render(): void {
    if (disposed)
      return
    if (server.status === 'running' && server.port != null) {
      // Never load the iframe before the auth handoff arrives, otherwise
      // code-server would render its login page inside the frame.
      if (!auth) {
        renderStarting()
        return
      }
      // Avoid tearing down a live editor iframe on unrelated state updates.
      if (frameSrc === codeServerUrl(server.port) && root.querySelector('.dcs-frame'))
        return
      renderRunning()
      return
    }
    frameSrc = null
    if (server.status === 'starting' || (busy && server.status !== 'error')) {
      renderStarting()
      return
    }
    if (!detection.checked) {
      renderConnecting()
      return
    }
    if (!detection.installed) {
      renderNotInstalled()
      return
    }
    renderLaunch()
  }

  // ---- bootstrap -----------------------------------------------------------

  renderConnecting()

  const initial = await call<CodeServerStatusResult>('devframes-plugin-code-server:status')
  if (initial)
    applyResult(initial)
  render()

  const state = await rpc.sharedState.get(STATE_KEY, {
    initialValue: { detection, server } as CodeServerSharedState,
  })
  const current = state.value() as CodeServerSharedState
  detection = current.detection ?? detection
  server = current.server ?? server

  const off = state.on('updated', (full: CodeServerSharedState) => {
    detection = full.detection ?? detection
    server = full.server ?? server
    // Shared state never carries the cookie; fetch it when the server comes up.
    if (server.status === 'running' && !auth) {
      void call<CodeServerStatusResult>('devframes-plugin-code-server:status').then((result) => {
        if (result?.auth)
          auth = result.auth
        render()
      })
      return
    }
    render()
  })
  render()

  return {
    rpc,
    dispose() {
      disposed = true
      off?.()
      root.remove()
    },
  }
}

export { STATE_KEY } from '../constants'
export type { CodeServerServerInfo, CodeServerSharedState, CodeServerStatus } from '../types'
