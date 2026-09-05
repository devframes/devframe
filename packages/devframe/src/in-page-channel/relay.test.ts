import type { InPageChannelRelayTransport } from './relay'
import type { InPageChannelProtocol } from './types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPageScriptChannel } from './page-script'
import { connectPanelChannel } from './panel'
import { IN_PAGE_CHANNEL_TAG, IN_PAGE_CHANNEL_VERSION } from './protocol'
import { createInPageChannelRelay } from './relay'

interface Protocol extends InPageChannelProtocol {
  pageScript: { highlight: (selector: string) => string }
  panel: Record<string, never>
  sharedStates: { report: { route: string, count: number } }
}

function fakeWindow(origin = 'https://app.test') {
  const listeners = new Set<(event: MessageEvent) => void>()
  const storage = new Map<string, string>()
  const win = {
    location: { origin },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    parent: undefined as Window | undefined,
    opener: null,
    sender: undefined as Window | undefined,
    addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.delete(fn),
    postMessage(data: unknown, _origin: string, ports: MessagePort[] = []) {
      win.dispatch({ data, origin, source: win.sender!, ports })
    },
    dispatch(event: Partial<MessageEvent>) {
      queueMicrotask(() => {
        for (const listener of listeners)
          listener(event as MessageEvent)
      })
    },
    listeners,
  }
  // eslint-disable-next-line slop/no-chained-type-assertions -- the fake substitutes the browser Window at the public channel boundary
  const window = win as unknown as Window
  win.parent = window
  win.sender = window
  return { win, window }
}

function transportPair() {
  const leftListeners = new Set<(data: unknown) => void>()
  const rightListeners = new Set<(data: unknown) => void>()
  function endpoint(local: typeof leftListeners, remote: typeof rightListeners): InPageChannelRelayTransport {
    return {
      postMessage(data) {
        const cloned = structuredClone(data)
        queueMicrotask(() => {
          for (const listener of remote)
            listener(cloned)
        })
      },
      onMessage(handler) {
        local.add(handler)
        return () => {
          local.delete(handler)
        }
      },
    }
  }
  return {
    panel: endpoint(leftListeners, rightListeners),
    page: endpoint(rightListeners, leftListeners),
    listeners: [leftListeners, rightListeners],
  }
}

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse())
    dispose()
})

function session(route: string) {
  const viewer = fakeWindow()
  const panelWindow = fakeWindow()
  const page = fakeWindow()
  panelWindow.win.parent = viewer.window
  panelWindow.win.sender = viewer.window
  viewer.win.sender = panelWindow.window
  const transport = transportPair()
  const stopPage = createInPageChannelRelay({ role: 'page', window: page.window, transport: transport.page })
  const stopPanel = createInPageChannelRelay({ role: 'panel', window: viewer.window, transport: transport.panel })
  cleanup.push(stopPage, stopPanel)
  const highlight = vi.fn((selector: string) => `${route}:${selector}`)
  const pageScript = createPageScriptChannel<Protocol>({
    name: 'devframes:relay-test',
    window: page.window,
    heartbeat: false,
    functions: { highlight: { handler: highlight } },
  })
  const panel = connectPanelChannel<Protocol>({
    name: 'devframes:relay-test',
    window: panelWindow.window,
    heartbeat: false,
    helloIntervalMs: 5,
    functions: {},
  })
  cleanup.push(() => pageScript.close(), () => panel.close())
  return { viewer, panelWindow, page, transport, stopPanel, stopPage, pageScript, panel, highlight }
}

describe('in-page channel relay', () => {
  it('connects existing panels to the inspected document for shared reports and highlighting', async () => {
    const s = session('/')
    const report = await s.pageScript.sharedState.get('report', { initialValue: { route: '/', count: 2 } })
    await vi.waitFor(() => expect(s.panel.status).toBe('connected'))
    const remoteReport = await s.panel.sharedState.get('report')
    expect(remoteReport.value()).toEqual({ route: '/', count: 2 })
    await expect(s.panel.call('highlight', '#submit')).resolves.toBe('/:#submit')
    expect(s.highlight).toHaveBeenCalledExactlyOnceWith('#submit')
    report.mutate((draft) => {
      draft.count = 3
    })
    await vi.waitFor(() => expect(remoteReport.value().count).toBe(3))
  })

  it('keeps two inspected sessions on the same origin isolated', async () => {
    const first = session('/first')
    const second = session('/second')
    await vi.waitFor(() => {
      expect(first.panel.status).toBe('connected')
      expect(second.panel.status).toBe('connected')
    })
    await expect(first.panel.call('highlight', '#one')).resolves.toBe('/first:#one')
    await expect(second.panel.call('highlight', '#two')).resolves.toBe('/second:#two')
    expect(first.highlight).toHaveBeenCalledExactlyOnceWith('#one')
    expect(second.highlight).toHaveBeenCalledExactlyOnceWith('#two')
  })

  it('reconnects an existing panel after its page relay is replaced', async () => {
    const s = session('/')
    await vi.waitFor(() => expect(s.panel.status).toBe('connected'))
    s.stopPage()
    await vi.waitFor(() => expect(s.panel.status).not.toBe('connected'))
    cleanup.push(createInPageChannelRelay({ role: 'page', window: s.page.window, transport: s.transport.page }))
    await vi.waitFor(() => expect(s.panel.status).toBe('connected'))
    await expect(s.panel.call('highlight', '#after-reconnect')).resolves.toBe('/:#after-reconnect')
    expect(s.pageScript.panels).toHaveLength(1)
  })

  it('can dispose after the external transport has disconnected', async () => {
    const s = session('/')
    await vi.waitFor(() => expect(s.panel.status).toBe('connected'))
    s.transport.panel.postMessage = () => {
      throw new Error('transport disconnected')
    }
    expect(() => s.stopPanel()).not.toThrow()
    expect(s.viewer.win.listeners.size).toBe(0)
    await vi.waitFor(() => expect(s.panel.status).not.toBe('connected'))
  })

  it('disconnects real endpoints and removes subscriptions when the relays are disposed', async () => {
    const s = session('/')
    await vi.waitFor(() => expect(s.panel.status).toBe('connected'))
    s.stopPanel()
    s.stopPanel()
    s.stopPage()
    await vi.waitFor(() => {
      expect(s.pageScript.panels).toHaveLength(0)
      expect(s.panel.status).not.toBe('connected')
    })
    expect(s.viewer.win.listeners.size).toBe(0)
    for (const listeners of s.transport.listeners)
      expect(listeners.size).toBe(0)
  })

  it('ignores unrelated, cross-origin, non-descendant and wrong-version window messages', async () => {
    const viewer = fakeWindow()
    const child = fakeWindow()
    const unrelated = fakeWindow()
    child.win.parent = viewer.window
    const send = vi.fn()
    const stop = createInPageChannelRelay({
      role: 'panel',
      window: viewer.window,
      transport: { postMessage: send, onMessage: () => () => {} },
    })
    cleanup.push(stop)
    const hello = {
      channel: IN_PAGE_CHANNEL_TAG,
      v: IN_PAGE_CHANNEL_VERSION,
      kind: 'hello',
      name: 'devframes:relay-test',
      panelId: 'panel',
    }
    viewer.win.dispatch({ data: { arbitrary: true }, origin: 'https://app.test', source: child.window })
    viewer.win.dispatch({ data: hello, origin: 'https://other.test', source: child.window })
    viewer.win.dispatch({ data: hello, origin: 'https://app.test', source: unrelated.window })
    viewer.win.dispatch({ data: { ...hello, v: 99 }, origin: 'https://app.test', source: child.window })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(send).not.toHaveBeenCalled()
    viewer.win.dispatch({ data: hello, origin: 'https://app.test', source: child.window })
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  })
})
