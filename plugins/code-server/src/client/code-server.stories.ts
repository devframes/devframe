import type { Meta, StoryObj } from '@storybook/html-vite'
import type { CodeServerViewState } from './view'
import { createCodeServerView } from './view'
import './style.css'

// A stand-in for the real code-server iframe so the "running" story renders
// without a live server.
const MOCK_EDITOR = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta name="color-scheme" content="dark light" /><style>
  html,body{height:100%;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#1e1e1e;color:#d4d4d4}
  .bar{height:35px;background:#333;display:flex;align-items:center;padding:0 12px;font-size:12px;color:#ccc}
  .body{display:flex;height:calc(100% - 35px)}
  .side{width:48px;background:#333}
  .main{flex:1;padding:16px;font-size:13px;line-height:1.6}
  .c{color:#569cd6}.s{color:#ce9178}.f{color:#dcdcaa}
</style></head><body>
  <div class="bar">code-server — mock editor (Storybook)</div>
  <div class="body"><div class="side"></div><div class="main">
    <div><span class="c">export function</span> <span class="f">createCodeServerDevframe</span>(<span class="c">options</span>) {</div>
    <div>&nbsp;&nbsp;<span class="c">return</span> <span class="f">defineDevframe</span>({ <span class="s">id</span>, <span class="s">name</span> })</div>
    <div>}</div>
  </div></div>
</body></html>`)}`

function renderState(state: CodeServerViewState): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = 'position:relative;width:100%;height:100vh'
  const view = createCodeServerView(container, {
    actions: {
      launch: () => console.warn('[story] launch'),
      recheck: () => console.warn('[story] recheck'),
    },
    // Keep stories hermetic: never touch real cookies or hosts.
    resolveEditorUrl: () => MOCK_EDITOR,
    applyAuth: () => {},
  })
  view.update(state)
  return container
}

const meta: Meta = {
  title: 'Code Server/Launcher',
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj

/** Awaiting the devframe connection / first status. */
export const Connecting: Story = {
  render: () => renderState({
    detection: { checked: false, installed: false, bin: 'code-server' },
    server: { status: 'stopped' },
  }),
}

/** Binary missing — install instructions and links. */
export const NotInstalled: Story = {
  render: () => renderState({
    detection: { checked: true, installed: false, bin: 'code-server' },
    server: { status: 'stopped' },
  }),
}

/** Installed and idle — the launch screen. */
export const Launch: Story = {
  render: () => renderState({
    detection: { checked: true, installed: true, version: '4.99.0', bin: 'code-server' },
    server: { status: 'stopped' },
  }),
}

/** A previous launch failed — the error surfaces above the launch button. */
export const LaunchError: Story = {
  render: () => renderState({
    detection: { checked: true, installed: true, version: '4.99.0', bin: 'code-server' },
    server: { status: 'error', error: 'Failed to spawn code-server: EADDRINUSE 127.0.0.1:8080' },
  }),
}

/** Spawned, waiting on the readiness probe (and the auth handoff). */
export const Starting: Story = {
  render: () => renderState({
    detection: { checked: true, installed: true, version: '4.99.0', bin: 'code-server' },
    server: { status: 'starting', port: 8080 },
    busy: true,
  }),
}

/** Ready — the editor fills the panel, signed in, with no chrome over it. */
export const Running: Story = {
  render: () => renderState({
    detection: { checked: true, installed: true, version: '4.99.0', bin: 'code-server' },
    server: { status: 'running', port: 8080, pid: 4242 },
    auth: { cookieName: 'code-server-session', cookieValue: 'a'.repeat(64) },
  }),
}
