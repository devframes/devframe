import type {
  CodeServerAuth,
  CodeServerDetection,
  CodeServerServerInfo,
} from '../types'

/** The data the view renders from. Pure — no RPC, no process knowledge. */
export interface CodeServerViewState {
  detection: CodeServerDetection
  server: CodeServerServerInfo
  /** Auth handoff; present only once the editor is reachable. */
  auth?: CodeServerAuth
  /** A request (launch / re-check) is in flight. */
  busy?: boolean
}

/** User intents the view surfaces. */
export interface CodeServerViewActions {
  launch: () => void
  recheck: () => void
}

export interface CodeServerViewOptions {
  actions?: Partial<CodeServerViewActions>
  /**
   * Build the editor iframe URL from the running port. Defaults to the
   * current page host so the cookie set on this origin reaches the iframe.
   */
  resolveEditorUrl?: (port: number) => string
  /**
   * Apply code-server's session cookie before the iframe loads. Defaults to
   * `document.cookie`. Storybook overrides this to a no-op.
   */
  applyAuth?: (auth: CodeServerAuth) => void
}

/** Discrete UI states, one per Storybook story. */
export type CodeServerPhase = 'connecting' | 'not-installed' | 'launch' | 'starting' | 'running'

export interface CodeServerViewHandle {
  /** Re-render from a new state (cheap; reuses the live iframe when unchanged). */
  update: (state: CodeServerViewState) => void
  dispose: () => void
}

const DOCS_URL = 'https://coder.com/docs/code-server/latest/install'
const REPO_URL = 'https://github.com/coder/code-server'

const INSTALL_COMMANDS: { label: string, command: string }[] = [
  { label: 'Install script (Linux / macOS)', command: 'curl -fsSL https://code-server.dev/install.sh | sh' },
  { label: 'npm', command: 'npm install -g code-server' },
  { label: 'Homebrew', command: 'brew install code-server' },
]

/** Map a state to its discrete UI phase. */
export function resolvePhase(state: CodeServerViewState): CodeServerPhase {
  const { detection, server, auth, busy } = state
  if (server.status === 'running' && server.port != null)
    // The iframe must not load before the auth handoff, or code-server shows
    // its login page — hold on the progress state until the cookie arrives.
    return auth ? 'running' : 'starting'
  if (server.status === 'starting' || (busy && server.status !== 'error'))
    return 'starting'
  if (!detection.checked)
    return 'connecting'
  if (!detection.installed)
    return 'not-installed'
  return 'launch'
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className)
    node.className = className
  if (text != null)
    node.textContent = text
  return node
}

function defaultEditorUrl(port: number): string {
  return `${location.protocol}//${location.hostname}:${port}/`
}

function defaultApplyAuth(auth: CodeServerAuth): void {
  document.cookie = `${auth.cookieName}=${auth.cookieValue}; path=/; SameSite=Lax`
}

/**
 * Create the code-server launcher view inside `container`. The view is a pure
 * function of {@link CodeServerViewState}: callers (the SPA via
 * `mountCodeServer`, or Storybook) push state with `update()` and wire intent
 * through `options.actions`. It performs no RPC and owns no process state, so
 * every UI phase can be rendered in isolation.
 */
export function createCodeServerView(
  container: HTMLElement,
  options: CodeServerViewOptions = {},
): CodeServerViewHandle {
  const resolveEditorUrl = options.resolveEditorUrl ?? defaultEditorUrl
  const applyAuth = options.applyAuth ?? defaultApplyAuth
  const launch = (): void => options.actions?.launch?.()
  const recheck = (): void => options.actions?.recheck?.()

  const root = el('div', 'dcs-root')
  container.append(root)

  let frameSrc: string | null = null

  function shell(...children: Node[]): void {
    frameSrc = null
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

  function renderNotInstalled(busy: boolean): void {
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
    actions.append(link('Installation docs ↗', DOCS_URL))
    actions.append(link('GitHub ↗', REPO_URL))
    nodes.push(actions)
    shell(...nodes)
  }

  function renderLaunch(state: CodeServerViewState): void {
    const { detection, server, busy } = state
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
    launchBtn.disabled = busy ?? false
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

  function renderRunning(state: CodeServerViewState): void {
    const port = state.server.port!
    const url = resolveEditorUrl(port)
    // Reuse the live editor iframe across unrelated state updates.
    if (frameSrc === url && root.querySelector('.dcs-frame'))
      return
    if (state.auth)
      applyAuth(state.auth)
    const frame = el('iframe', 'dcs-frame') as HTMLIFrameElement
    frame.setAttribute('allow', 'clipboard-read; clipboard-write; cross-origin-isolated')
    frame.src = url
    frameSrc = url
    root.replaceChildren(frame)
  }

  function link(text: string, href: string): HTMLAnchorElement {
    const a = el('a', 'dcs-link', text) as HTMLAnchorElement
    a.href = href
    a.target = '_blank'
    a.rel = 'noreferrer'
    return a
  }

  function update(state: CodeServerViewState): void {
    switch (resolvePhase(state)) {
      case 'running':
        renderRunning(state)
        break
      case 'starting':
        renderStarting()
        break
      case 'connecting':
        renderConnecting()
        break
      case 'not-installed':
        renderNotInstalled(state.busy ?? false)
        break
      case 'launch':
        renderLaunch(state)
        break
    }
  }

  return {
    update,
    dispose() {
      root.remove()
    },
  }
}
