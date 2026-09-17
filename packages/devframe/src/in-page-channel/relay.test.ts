import type { InPageChannelRelayTransport } from './relay'
import type { InPageChannelProtocol } from './types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPageScriptChannel } from './page-script'
import { connectPanelChannel } from './panel'
import { IN_PAGE_CHANNEL_TAG, IN_PAGE_CHANNEL_VERSION } from './protocol'
import { createInPageChannelRelay } from './relay'

interface Protocol extends InPageChannelProtocol {
  functions: {
    pageScript: { highlight: (selector: string) => string }
    panel: Record<string, never>
  }
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

it('deduplicates panel retries while the transport grant is delayed', async () => {
  const s = session('/')
  const send = s.transport.page.postMessage
  const grants: unknown[] = []
  s.transport.page.postMessage = (data) => {
    if ((data as { kind: string }).kind === 'grant')
      grants.push(data)
    else
      send(data)
  }
  await vi.waitFor(() => expect(grants).toHaveLength(1))
  await new Promise(resolve => setTimeout(resolve, 80))
  expect(grants).toHaveLength(1)
  send(grants[0])
  await vi.waitFor(() => expect(s.panel.status).toBe('connected'))
  await expect(s.panel.call('highlight', '#slow')).resolves.toBe('/:#slow')
  expect(s.pageScript.panels).toHaveLength(1)
})

it('cleans a late page grant after the relay connection was cancelled without heartbeat', async () => {
  const s = session('/')
  const post = s.page.win.postMessage
  let release: (() => void) | undefined
  s.page.win.postMessage = (data, origin, ports) => {
    if ((data as { kind: string }).kind === 'grant')
      release = () => post(data, origin, ports)
    else
      post(data, origin, ports)
  }
  await vi.waitFor(() => expect(s.pageScript.panels).toHaveLength(1))
  s.stopPanel()
  await new Promise(resolve => setTimeout(resolve, 0))
  release!()
  await vi.waitFor(() => expect(s.pageScript.panels).toHaveLength(0))
})

it('keeps one peer when a pending open is repeated before the local grant arrives', async () => {
  const s = session('/')
  const post = s.page.win.postMessage
  const grants: (() => void)[] = []
  s.page.win.postMessage = (data, origin, ports) => {
    if ((data as { kind: string }).kind === 'grant')
      grants.push(() => post(data, origin, ports))
    else
      post(data, origin, ports)
  }
  await vi.waitFor(() => expect(grants.length).toBeGreaterThan(0))
  await new Promise(resolve => setTimeout(resolve, 80))
  expect(grants).toHaveLength(1)
  grants[0]!()
  await vi.waitFor(() => expect(s.panel.status).toBe('connected'))
  await expect(s.panel.call('highlight', '#pending')).resolves.toBe('/:#pending')
})

it('retries a timed-out local handshake and rejects its late grant', async () => {
  const s = session('/')
  const post = s.page.win.postMessage
  const grants: (() => void)[] = []
  s.page.win.postMessage = (data, origin, ports) => {
    if ((data as { kind: string }).kind === 'grant')
      grants.push(() => post(data, origin, ports))
    else
      post(data, origin, ports)
  }
  await vi.waitFor(() => expect(grants).toHaveLength(2), { timeout: 2500 })
  grants[1]!()
  await vi.waitFor(() => expect(s.panel.status).toBe('connected'))
  grants[0]!()
  await vi.waitFor(() => expect(s.pageScript.panels).toHaveLength(1))
  await expect(s.panel.call('highlight', '#new-attempt')).resolves.toBe('/:#new-attempt')
})

it('connects when the page script starts after the first handshake', async () => {
  const s = session('/')
  s.pageScript.close()
  await new Promise(resolve => setTimeout(resolve, 50))
  const pageScript = createPageScriptChannel<Protocol>({
    name: 'devframes:relay-test',
    window: s.page.window,
    heartbeat: false,
    functions: { highlight: { handler: s.highlight } },
  })
  cleanup.push(() => pageScript.close())
  await vi.waitFor(() => expect(s.panel.status).toBe('connected'), { timeout: 2500 })
  await expect(s.panel.call('highlight', '#late-script')).resolves.toBe('/:#late-script')
  expect(pageScript.panels).toHaveLength(1)
})

it('leaves direct in-page grants available to their own panel', async () => {
  const s = session('/')
  const direct = connectPanelChannel<Protocol>({
    name: 'devframes:relay-test',
    window: s.page.window,
    targets: [s.page.window],
    heartbeat: false,
    functions: {},
  })
  cleanup.push(() => direct.close())
  await vi.waitFor(() => {
    expect(s.panel.status).toBe('connected')
    expect(direct.status).toBe('connected')
  })
  await expect(direct.call('highlight', '#direct')).resolves.toBe('/:#direct')
  expect(s.pageScript.panels).toHaveLength(2)
})

it('stops pending handshakes when the panel closes before the page script loads', async () => {
  const s = session('/')
  s.pageScript.close()
  const post = vi.spyOn(s.page.win, 'postMessage')
  await vi.waitFor(() => expect(post).toHaveBeenCalled())
  expect(s.panel.status).toBe('connecting')
  s.panel.close()
  await new Promise(resolve => setTimeout(resolve, 0))
  post.mockClear()

  const pageScript = createPageScriptChannel<Protocol>({
    name: 'devframes:relay-test',
    window: s.page.window,
    heartbeat: false,
    functions: { highlight: { handler: s.highlight } },
  })
  cleanup.push(() => pageScript.close())
  await new Promise(resolve => setTimeout(resolve, 1200))
  expect(s.panel.status).toBe('closed')
  expect(pageScript.panels).toHaveLength(0)
  expect(post).not.toHaveBeenCalled()
})

it.each(['page', 'transport'] as const)('cleans a pending %s grant when only the panel closes', async (boundary) => {
  const s = session('/')
  let release!: () => void
  if (boundary === 'page') {
    const post = s.page.win.postMessage
    s.page.win.postMessage = (data, origin, ports) => {
      if ((data as { kind: string }).kind === 'grant')
        release = () => post(data, origin, ports)
      else
        post(data, origin, ports)
    }
  }
  else {
    const send = s.transport.page.postMessage
    s.transport.page.postMessage = (data) => {
      if ((data as { kind: string }).kind === 'grant')
        release = () => send(data)
      else
        send(data)
    }
  }
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  expect(s.panel.status).toBe('connecting')
  s.panel.close()
  await new Promise(resolve => setTimeout(resolve, 0))
  release()
  await vi.waitFor(() => expect(s.pageScript.panels).toHaveLength(0))
})

it('only cancels a handshake from its owning window and matching identity', async () => {
  const s = session('/')
  s.pageScript.close()
  const send = vi.spyOn(s.transport.panel, 'postMessage')
  await vi.waitFor(() => expect(send).toHaveBeenCalled())
  const open = send.mock.calls[0]![0] as { id: string, handshake: object }
  const cancel = { ...open.handshake, kind: 'cancel' }
  const sibling = fakeWindow()
  sibling.win.parent = s.viewer.window
  const dispatch = (data: object, source = s.panelWindow.window, origin = 'https://app.test') => {
    s.viewer.win.dispatch({ data, source, origin })
  }
  dispatch(cancel, sibling.window)
  dispatch(cancel, s.panelWindow.window, 'https://other.test')
  dispatch({ ...cancel, v: 99 })
  dispatch({ ...cancel, name: 'another-channel' })
  dispatch({ ...cancel, panelId: 'another-panel' })
  dispatch({ ...cancel, instanceId: 'another-instance' })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(send.mock.calls.some(([data]) => (data as { kind: string }).kind === 'close')).toBe(false)

  s.panel.close()
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: open.id, kind: 'close' })))
})
