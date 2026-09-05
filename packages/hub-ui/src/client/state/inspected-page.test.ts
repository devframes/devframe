import type { InPageChannelProtocol } from 'devframe/in-page-channel'
import { connectPanelChannel, createPageScriptChannel } from 'devframe/in-page-channel'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectInspectedPage, installInspectedPageHost } from './inspected-page'
import { fakeWindow } from './inspected-page.test-utils'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse())
    dispose()
  vi.useRealTimers()
})

function setup(options: { adapter?: boolean, activate?: (id: string) => Promise<boolean> } = {}) {
  const extension = fakeWindow('chrome-extension://test')
  const viewer = fakeWindow('https://app.test', '?devframe-inspected-page=session-a&devframe-parent-origin=chrome-extension%3A%2F%2Ftest')
  const page = fakeWindow()
  viewer.win.parent = extension.window
  extension.win.sender = viewer.window
  const selectionListeners = new Set<(id: string | null) => void>()
  const host = {
    prepare: vi.fn(async (_id: string) => true),
    activate: vi.fn(options.activate ?? (async (_id: string) => true)),
    deactivate: vi.fn(async (_id: string) => true),
    onSelection: (listener: (id: string | null) => void) => {
      selectionListeners.add(listener)
      return () => selectionListeners.delete(listener)
    },
  }
  const stopHost = installInspectedPageHost(host, page.window)
  cleanup.push(stopHost)
  if (options.adapter !== false) {
    extension.win.addEventListener('message', (event) => {
      // The browser adapter binds this port to its known viewer and inspected
      // document. Production adapter identity checks live in packages/webext.
      if (event.source !== viewer.window || event.origin !== viewer.win.location.origin
        || event.data?.session !== 'session-a') {
        return
      }
      page.win.dispatch('message', {
        data: event.data,
        origin: page.win.location.origin,
        source: page.window,
        ports: event.ports,
      })
    })
  }
  return { viewer, extension, page, host, stopHost, selectionListeners }
}

async function connect(s: ReturnType<typeof setup>) {
  const target = await connectInspectedPage(s.viewer.window)
  expect(target).toBeDefined()
  cleanup.push(() => target!.close())
  return target!
}

describe('inspected page bridge', () => {
  it('prepares and activates registered entries on the inspected page and forwards selection', async () => {
    const s = setup()
    const target = await connect(s)
    await expect(target.prepare('a11y')).resolves.toBe(true)
    await expect(target.activate('tracer')).resolves.toBe(true)
    expect(s.host.prepare).toHaveBeenCalledExactlyOnceWith('a11y')
    expect(s.host.activate).toHaveBeenCalledExactlyOnceWith('tracer')
    const changed = vi.fn()
    const unsubscribe = target.onSelection(changed)
    for (const listener of s.selectionListeners)
      listener(null)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledExactlyOnceWith(null))
    unsubscribe()
    await expect(target.deactivate('tracer')).resolves.toBe(true)
    expect(s.host.deactivate).toHaveBeenCalledExactlyOnceWith('tracer')
  })

  it('carries an existing panel channel through the dedicated bridge port', async () => {
    interface Protocol extends InPageChannelProtocol {
      pageScript: { route: () => string }
      panel: Record<string, never>
    }
    const s = setup()
    const pageScript = createPageScriptChannel<Protocol>({
      name: 'devframes:bridge-test',
      window: s.page.window,
      heartbeat: false,
      functions: { route: { handler: () => '/' } },
    })
    cleanup.push(() => pageScript.close())
    await connect(s)
    const frame = fakeWindow()
    frame.win.parent = s.viewer.window
    frame.win.sender = s.viewer.window
    s.viewer.win.sender = frame.window
    const channel = connectPanelChannel<Protocol>({
      name: 'devframes:bridge-test',
      window: frame.window,
      heartbeat: false,
      helloIntervalMs: 5,
      functions: {},
    })
    cleanup.push(() => channel.close())
    await vi.waitFor(() => expect(channel.status).toBe('connected'))
    await expect(channel.call('route')).resolves.toBe('/')
  })

  it('deactivates an in-flight action after disconnecting and rejects its pending response', async () => {
    let finish!: (value: boolean) => void
    const activation = new Promise<boolean>((resolve) => {
      finish = resolve
    })
    const s = setup({ activate: () => activation })
    const target = await connect(s)
    const result = target.activate('tracer')
    const rejected = expect(result).rejects.toThrow('disconnected')
    await vi.waitFor(() => expect(s.host.activate).toHaveBeenCalledOnce())
    target.close()
    await rejected
    finish(true)
    await vi.waitFor(() => expect(s.host.deactivate).toHaveBeenCalledExactlyOnceWith('tracer'))
    expect(s.selectionListeners.size).toBe(0)
  })

  it('finishes old-session teardown before enabling the same action in its replacement', async () => {
    let finish!: (value: boolean) => void
    const firstActivation = new Promise<boolean>((resolve) => {
      finish = resolve
    })
    let enabled = false
    let activations = 0
    const order: string[] = []
    const s = setup({
      activate: async () => {
        activations++
        if (activations === 1) {
          order.push('first:start')
          await firstActivation
          order.push('first:finish')
        }
        else {
          order.push('replacement:start')
        }
        enabled = true
        return true
      },
    })
    s.host.deactivate.mockImplementation(async () => {
      order.push('deactivate')
      enabled = false
      return true
    })
    const first = await connect(s)
    const firstResult = expect(first.activate('tracer')).rejects.toThrow('disconnected')
    await vi.waitFor(() => expect(s.host.activate).toHaveBeenCalledOnce())
    const replacement = await connect(s)
    await firstResult
    const replacementResult = replacement.activate('tracer')
    try {
      // Give the replacement request time to reach the host while the original
      // action is still loading. Its execution must wait for old teardown.
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(s.host.activate).toHaveBeenCalledOnce()
    }
    finally {
      finish(true)
    }
    await expect(replacementResult).resolves.toBe(true)
    expect(order).toEqual(['first:start', 'first:finish', 'deactivate', 'replacement:start'])
    expect(enabled).toBe(true)
    expect(s.host.deactivate).toHaveBeenCalledExactlyOnceWith('tracer')
  })

  it('closes a timed-out activation and tears down when the pending action finishes', async () => {
    let finish!: (value: boolean) => void
    let started!: () => void
    const activation = new Promise<boolean>((resolve) => {
      finish = resolve
    })
    const activationStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const s = setup({
      activate: () => {
        started()
        return activation
      },
    })
    const target = await connect(s)
    const disconnected = vi.fn()
    target.onDisconnect(disconnected)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const result = expect(target.activate('tracer')).rejects.toThrow('did not answer the activate request')
    await activationStarted
    await vi.advanceTimersByTimeAsync(12_000)
    await result
    expect(disconnected).toHaveBeenCalledOnce()
    await expect(target.prepare('a11y')).rejects.toThrow('disconnected')
    finish(true)
    vi.useRealTimers()
    await vi.waitFor(() => expect(s.host.deactivate).toHaveBeenCalledExactlyOnceWith('tracer'))
  })

  it('rejects unsupported inspected-page targets instead of selecting a local target', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const s = setup({ adapter: false })
    const result = expect(connectInspectedPage(s.viewer.window)).rejects.toThrow('does not support')
    await vi.advanceTimersByTimeAsync(12_000)
    await result
    expect(s.host.prepare).not.toHaveBeenCalled()
    expect(s.viewer.win.listeners.get('pagehide')?.size).toBe(0)
  })

  it('ignores host connection requests with an untrusted source, origin or invalid session', async () => {
    const s = setup({ adapter: false })
    const ports = Array.from({ length: 4 }, () => new MessageChannel())
    const received = vi.fn()
    for (const pair of ports) {
      pair.port1.addEventListener('message', received)
      pair.port1.start()
      cleanup.push(() => {
        pair.port1.close()
        pair.port2.close()
      })
    }
    const valid = { type: 'devframe:inspected-page:connect', session: 'session-a' }
    s.page.win.dispatch('message', { data: valid, origin: 'https://app.test', source: s.viewer.window, ports: [ports[0]!.port2] })
    s.page.win.dispatch('message', { data: valid, origin: 'https://evil.test', source: s.page.window, ports: [ports[1]!.port2] })
    s.page.win.dispatch('message', { data: { ...valid, session: '' }, origin: 'https://app.test', source: s.page.window, ports: [ports[2]!.port2] })
    s.page.win.dispatch('message', { data: { ...valid, session: 1 }, origin: 'https://app.test', source: s.page.window, ports: [ports[3]!.port2] })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(received).not.toHaveBeenCalled()
    expect(s.selectionListeners.size).toBe(0)
  })

  it('returns no inspected target when the viewer has no session query', async () => {
    const viewer = fakeWindow()
    await expect(connectInspectedPage(viewer.window)).resolves.toBeUndefined()
    expect(viewer.win.listeners.size).toBe(0)
  })

  it.each(['*', 'null', ''])('rejects an invalid parent origin %j before connecting', async (parentOrigin) => {
    const viewer = fakeWindow('https://app.test', `?devframe-inspected-page=session&devframe-parent-origin=${encodeURIComponent(parentOrigin)}`)
    viewer.win.parent = fakeWindow('chrome-extension://test').window
    await expect(connectInspectedPage(viewer.window)).rejects.toThrow('adapter is unavailable')
  })
})
