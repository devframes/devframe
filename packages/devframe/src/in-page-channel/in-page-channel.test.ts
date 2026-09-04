import type { ConnectPanelChannelOptions, CreatePageScriptChannelOptions, InPageChannelProtocol, PageScriptChannel, PanelChannel } from './types'
import { describe, expect, it, vi } from 'vitest'
import { InPageChannelError } from './internal'
import { createPageScriptChannel } from './page-script'
import { connectPanelChannel } from './panel'
import { IN_PAGE_CHANNEL_TAG, IN_PAGE_CHANNEL_VERSION } from './protocol'

interface TestProtocol extends InPageChannelProtocol {
  pageScript: {
    echo: (value: string) => string
    sum: (a: number, b: number) => number
    boom: () => void
    strict: (payload: unknown) => unknown
    note: (value: string) => void
  }
  panel: {
    'ping-panel': (value: string) => string
    'notify': (value: string) => void
  }
  sharedStates: {
    doc: { count: number, label?: string }
  }
}

function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = (): void => {
      if (predicate())
        return resolve()
      if (Date.now() - started > timeoutMs)
        return reject(new Error('until(): condition not met in time'))
      setTimeout(tick, 5)
    }
    tick()
  })
}

const noHandshake = { window: false as const, heartbeat: false as const }

const defaultPageScriptFunctions: NonNullable<CreatePageScriptChannelOptions<TestProtocol>['functions']> = {
  echo: { handler: value => value },
  sum: { handler: (a, b) => a + b },
  boom: { handler: () => {} },
  strict: { handler: payload => payload },
  note: { type: 'event', handler: () => {} },
}

const defaultPanelFunctions: NonNullable<ConnectPanelChannelOptions<TestProtocol>['functions']> = {
  'ping-panel': { handler: value => `pong:${value}` },
  'notify': { type: 'event', handler: () => {} },
}

function createLinkedPair(options?: {
  pageScript?: Partial<CreatePageScriptChannelOptions<TestProtocol>>
  panel?: Partial<ConnectPanelChannelOptions<TestProtocol>>
}): { pageScript: PageScriptChannel<TestProtocol>, panel: PanelChannel<TestProtocol>, dispose: () => void } {
  const { port1, port2 } = new MessageChannel()
  const pageScript = createPageScriptChannel<TestProtocol>({
    name: 'devframes:test',
    ...noHandshake,
    functions: {
      ...defaultPageScriptFunctions,
      boom: { handler: () => {
        throw new Error('exploded')
      } },
      strict: { jsonSerializable: true, handler: payload => payload },
    },
    ...options?.pageScript,
  })
  pageScript.addPanelPort(port1)
  const panel = connectPanelChannel<TestProtocol>({
    name: 'devframes:test',
    ...noHandshake,
    transport: port2,
    functions: defaultPanelFunctions,
    ...options?.panel,
  })
  return {
    pageScript,
    panel,
    dispose: () => {
      panel.close()
      pageScript.close()
    },
  }
}

describe('in-page channel over bring-your-own ports', () => {
  it('round-trips calls, arguments, and results', async () => {
    const { pageScript, panel, dispose } = createLinkedPair()
    try {
      expect(panel.status).toBe('connected')
      expect(pageScript.panels).toHaveLength(1)
      await expect(panel.call('echo', 'hello')).resolves.toBe('hello')
      await expect(panel.call('sum', 2, 40)).resolves.toBe(42)
    }
    finally {
      dispose()
    }
  })

  it('propagates handler errors to the caller', async () => {
    const { panel, dispose } = createLinkedPair()
    try {
      await expect(panel.call('boom')).rejects.toThrow('exploded')
    }
    finally {
      dispose()
    }
  })

  it('rejects calls to unknown functions', async () => {
    const { panel, dispose } = createLinkedPair()
    try {
      await expect(panel.call('missing' as any)).rejects.toThrow(/not found/)
    }
    finally {
      dispose()
    }
  })

  it('enforces jsonSerializable payloads with a coded error', async () => {
    const { panel, dispose } = createLinkedPair()
    try {
      // A Map survives structured clone, so it reaches the receiving side,
      // where the jsonSerializable contract rejects it, naming the path.
      const rejection = await panel.call('strict', { nested: new Map() }).catch(error => error) as Error
      expect(rejection.message).toContain('jsonSerializable')
      expect(rejection.message).toContain('nested')
      // Plain JSON passes.
      await expect(panel.call('strict', { ok: [1, 'two', null] })).resolves.toEqual({ ok: [1, 'two', null] })
    }
    finally {
      dispose()
    }
  })

  it('wraps DataCloneError with a helpful coded error', async () => {
    const { panel, dispose } = createLinkedPair()
    try {
      const rejection = await panel.call('echo', (() => {}) as any).catch(error => error)
      expect(rejection).toBeInstanceOf(InPageChannelError)
      expect(rejection.code).toBe('not-cloneable')
    }
    finally {
      dispose()
    }
  })

  it('validates arguments against Standard Schemas', async () => {
    const { s } = await import('devframe/utils/simple-schema')
    const { port1, port2 } = new MessageChannel()
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      functions: {
        ...defaultPageScriptFunctions,
        note: {
          args: [s.string()] as const,
          returns: s.void(),
          handler: () => {},
        },
      },
    })
    pageScript.addPanelPort(port1)
    const panel = connectPanelChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      transport: port2,
      functions: defaultPanelFunctions,
    })
    try {
      await expect(panel.call('note', 'fine')).resolves.toBeUndefined()
      const rejection = await panel.call('note', 42 as any).catch(error => error)
      expect(rejection.message).toContain('rejected argument 0')
    }
    finally {
      panel.close()
      pageScript.close()
    }
  })

  it('fans events out to runtime panel listeners and supports unsubscribing', async () => {
    const a = new MessageChannel()
    const b = new MessageChannel()
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      functions: defaultPageScriptFunctions,
    })
    pageScript.addPanelPort(a.port1)
    pageScript.addPanelPort(b.port1)
    const received: string[] = []
    const panelA = connectPanelChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      transport: a.port2,
      functions: {
        'ping-panel': defaultPanelFunctions['ping-panel'],
      },
    })
    pageScript.emit('notify', 'before-listener')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(received).toEqual([])
    const offNotify = panelA.on('notify', value => received.push(`a:${value}`))
    // Panel B deliberately has no listener for this event.
    const panelB = connectPanelChannel<InPageChannelProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      transport: b.port2,
    })
    try {
      expect(pageScript.panels).toHaveLength(2)
      pageScript.emit('notify', 'scan')
      await until(() => received.length === 1)
      expect(received).toEqual(['a:scan'])
      offNotify()
      pageScript.emit('notify', 'ignored')
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(received).toEqual(['a:scan'])
    }
    finally {
      panelA.close()
      panelB.close()
      pageScript.close()
    }
  })

  it('lets the page script call one panel through its peer handle', async () => {
    const { port1, port2 } = new MessageChannel()
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      functions: defaultPageScriptFunctions,
    })
    pageScript.addPanelPort(port1)
    const panel = connectPanelChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      transport: port2,
      functions: defaultPanelFunctions,
    })
    try {
      const peer = pageScript.panels[0]!
      await expect(peer.call('ping-panel', 'x')).resolves.toBe('pong:x')
    }
    finally {
      panel.close()
      pageScript.close()
    }
  })

  it('applies serialize/deserialize hooks to arguments and results', async () => {
    const { port1, port2 } = new MessageChannel()
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      functions: defaultPageScriptFunctions,
    })
    pageScript.addPanelPort(port1)
    const panel = connectPanelChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      transport: port2,
      functions: defaultPanelFunctions,
      /** Unwrap a fake reactivity wrapper on the way out, tag on the way in. */
      serialize: value => (value && typeof value === 'object' && '__wrapped' in (value as any))
        ? (value as any).__wrapped
        : value,
      deserialize: value => typeof value === 'string' ? `in:${value}` : value,
    })
    try {
      await expect(panel.call('echo', { __wrapped: 'raw' } as any)).resolves.toBe('in:raw')
    }
    finally {
      panel.close()
      pageScript.close()
    }
  })

  it('notifies the page script of panel lifecycle', async () => {
    const { port1, port2 } = new MessageChannel()
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      functions: defaultPageScriptFunctions,
    })
    const connected: string[] = []
    const disconnected: string[] = []
    pageScript.events.on('panel:connected', peer => connected.push(peer.id))
    pageScript.events.on('panel:disconnected', peer => disconnected.push(peer.id))
    pageScript.addPanelPort(port1)
    const panel = connectPanelChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      transport: port2,
      functions: defaultPanelFunctions,
    })
    try {
      expect(connected).toHaveLength(1)
      panel.close()
      await until(() => disconnected.length === 1)
      expect(disconnected).toEqual(connected)
      expect(pageScript.panels).toHaveLength(0)
    }
    finally {
      pageScript.close()
    }
  })
})

describe('in-page channel shared state', () => {
  it('replays the authority snapshot and streams patches to panels', async () => {
    const { pageScript, panel, dispose } = createLinkedPair()
    try {
      const authority = await pageScript.sharedState.get('doc', { initialValue: { count: 1 } })
      const mirror = await panel.sharedState.get('doc')
      expect(mirror.value()).toEqual({ count: 1 })

      authority.mutate((draft) => {
        draft.count = 2
        draft.label = 'updated'
      })
      await until(() => mirror.value().count === 2)
      expect(mirror.value()).toEqual({ count: 2, label: 'updated' })
    }
    finally {
      dispose()
    }
  })

  it('applies panel mutations at the authority and converges other panels', async () => {
    const a = new MessageChannel()
    const b = new MessageChannel()
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      ...noHandshake,
      functions: defaultPageScriptFunctions,
    })
    pageScript.addPanelPort(a.port1)
    pageScript.addPanelPort(b.port1)
    const panelA = connectPanelChannel<TestProtocol>({ name: 'devframes:test', ...noHandshake, transport: a.port2, functions: defaultPanelFunctions })
    const panelB = connectPanelChannel<TestProtocol>({ name: 'devframes:test', ...noHandshake, transport: b.port2, functions: defaultPanelFunctions })
    try {
      const authority = await pageScript.sharedState.get('doc', { initialValue: { count: 0 } })
      const mirrorA = await panelA.sharedState.get('doc')
      const mirrorB = await panelB.sharedState.get('doc')

      mirrorA.mutate((draft) => {
        draft.count = 7
      })
      await until(() => authority.value().count === 7)
      await until(() => mirrorB.value().count === 7)
    }
    finally {
      panelA.close()
      panelB.close()
      pageScript.close()
    }
  })

  it('seeds a late-joining panel with the current value', async () => {
    const { port1, port2 } = new MessageChannel()
    const pageScript = createPageScriptChannel<TestProtocol>({ name: 'devframes:test', ...noHandshake, functions: defaultPageScriptFunctions })
    const authority = await pageScript.sharedState.get('doc', { initialValue: { count: 0 } })
    authority.mutate((draft) => {
      draft.count = 41
    })
    authority.mutate((draft) => {
      draft.count += 1
    })

    pageScript.addPanelPort(port1)
    const panel = connectPanelChannel<TestProtocol>({ name: 'devframes:test', ...noHandshake, transport: port2, functions: defaultPanelFunctions })
    try {
      const mirror = await panel.sharedState.get('doc')
      expect(mirror.value()).toEqual({ count: 42 })
    }
    finally {
      panel.close()
      pageScript.close()
    }
  })

  it('requires the authority to initialize a state', async () => {
    const { pageScript, dispose } = createLinkedPair()
    try {
      await expect(pageScript.sharedState.get('doc')).rejects.toMatchObject({ code: 'state-uninitialized' })
    }
    finally {
      dispose()
    }
  })
})

// ── handshake over fake windows ──────────────────────────────────────────

interface FakeWindow {
  location: { origin: string }
  sessionStorage: { getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }
  parent?: FakeWindow
  opener: FakeWindow | null
  addEventListener: (type: string, fn: (event: MessageEvent) => void) => void
  removeEventListener: (type: string, fn: (event: MessageEvent) => void) => void
  postMessage: (data: unknown, targetOrigin: string, transfer?: unknown[]) => void
  /** Test-harness sender identity stamped on delivered events. */
  __sender: { origin: string, source: FakeWindow | null }
  /** Deliver a synthetic message event directly. */
  __dispatch: (event: Partial<MessageEvent>) => void
}

/** The test fake structurally stands in for the real DOM `Window` at the channel seam. */
function asWindow(win: FakeWindow): Window {
  // eslint-disable-next-line slop/no-chained-type-assertions -- the test fake has no structural overlap with the DOM Window it substitutes for
  return win as unknown as Window
}

function createFakeWindow(origin: string): FakeWindow {
  const listeners: ((event: MessageEvent) => void)[] = []
  const storage = new Map<string, string>()
  const win: FakeWindow = {
    location: { origin },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
    },
    opener: null,
    addEventListener: (type, fn) => {
      if (type === 'message')
        listeners.push(fn)
    },
    removeEventListener: (type, fn) => {
      const index = listeners.indexOf(fn)
      if (index >= 0)
        listeners.splice(index, 1)
    },
    postMessage: (data, _targetOrigin, transfer) => {
      win.__dispatch({ data, origin: win.__sender.origin, source: win.__sender.source as any, ports: (transfer ?? []) as any })
    },
    __sender: { origin, source: null },
    __dispatch: (event) => {
      queueMicrotask(() => {
        for (const fn of [...listeners])
          fn(event as MessageEvent)
      })
    },
  }
  win.parent = win
  return win
}

/** A same-origin host page + embedded panel window pair. */
function createWindowPair(origin = 'https://app.test'): { hostWin: FakeWindow, panelWin: FakeWindow } {
  const hostWin = createFakeWindow(origin)
  const panelWin = createFakeWindow(origin)
  panelWin.parent = hostWin
  hostWin.__sender = { origin, source: panelWin }
  panelWin.__sender = { origin, source: hostWin }
  return { hostWin, panelWin }
}

const fastHello = { helloIntervalMs: 5, heartbeat: false as const }

describe('in-page channel handshake', () => {
  it('connects a panel to the page script and survives page-script restarts', async () => {
    const { hostWin, panelWin } = createWindowPair()
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      window: asWindow(hostWin),
      heartbeat: false,
      functions: defaultPageScriptFunctions,
    })
    const panel = connectPanelChannel<TestProtocol>({
      name: 'devframes:test',
      window: asWindow(panelWin),
      targets: [asWindow(hostWin)],
      ...fastHello,
      functions: defaultPanelFunctions,
    })
    try {
      await panel.whenConnected(2000)
      expect(panel.pageScript?.instanceId).toBe(pageScript.instanceId)
      await expect(panel.call('echo', 'hi')).resolves.toBe('hi')

      // The page script goes away (host page reload) …
      pageScript.close()
      await until(() => panel.status === 'connecting')

      // … and a fresh one boots in the same window: the panel re-handshakes.
      const revived = createPageScriptChannel<TestProtocol>({
        name: 'devframes:test',
        window: asWindow(hostWin),
        heartbeat: false,
        functions: {
          ...defaultPageScriptFunctions,
          echo: { handler: value => `revived:${value}` },
        },
      })
      try {
        await panel.whenConnected(2000)
        await expect(panel.call('echo', 'hi')).resolves.toBe('revived:hi')
      }
      finally {
        revived.close()
      }
    }
    finally {
      panel.close()
      pageScript.close()
    }
  })

  it('buffers calls and events made while connecting and flushes on connect', async () => {
    const { hostWin, panelWin } = createWindowPair()
    const noted: string[] = []
    const panel = connectPanelChannel<TestProtocol>({
      name: 'devframes:test',
      window: asWindow(panelWin),
      targets: [asWindow(hostWin)],
      ...fastHello,
      functions: defaultPanelFunctions,
    })
    const early = panel.call('echo', 'early')
    panel.emit('note', 'buffered')

    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      window: asWindow(hostWin),
      heartbeat: false,
      functions: defaultPageScriptFunctions,
    })
    pageScript.on('note', value => noted.push(value))
    try {
      await expect(early).resolves.toBe('early')
      await until(() => noted.length === 1)
      expect(noted).toEqual(['buffered'])
    }
    finally {
      panel.close()
      pageScript.close()
    }
  })

  it('ignores hellos from disallowed origins', async () => {
    const { hostWin, panelWin } = createWindowPair()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test-origin',
      window: asWindow(hostWin),
      heartbeat: false,
      functions: defaultPageScriptFunctions,
    })
    try {
      hostWin.__dispatch({
        data: {
          channel: IN_PAGE_CHANNEL_TAG,
          v: IN_PAGE_CHANNEL_VERSION,
          kind: 'hello',
          name: 'devframes:test-origin',
          panelId: 'evil-panel',
        },
        origin: 'https://evil.test',
        source: panelWin as any,
      })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(pageScript.panels).toHaveLength(0)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('disallowed origin'))
    }
    finally {
      warn.mockRestore()
      pageScript.close()
    }
  })

  it('ignores handshakes with a different protocol version', async () => {
    const { hostWin, panelWin } = createWindowPair()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test-version',
      window: asWindow(hostWin),
      heartbeat: false,
      functions: defaultPageScriptFunctions,
    })
    try {
      hostWin.__dispatch({
        data: {
          channel: IN_PAGE_CHANNEL_TAG,
          v: IN_PAGE_CHANNEL_VERSION + 1,
          kind: 'hello',
          name: 'devframes:test-version',
          panelId: 'future-panel',
        },
        origin: hostWin.location.origin,
        source: panelWin as any,
      })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(pageScript.panels).toHaveLength(0)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('protocol version'))
    }
    finally {
      warn.mockRestore()
      pageScript.close()
    }
  })

  it('honors an instance pin', async () => {
    const { hostWin, panelWin } = createWindowPair()
    const pageScript = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      window: asWindow(hostWin),
      heartbeat: false,
      functions: defaultPageScriptFunctions,
    })
    const pinnedElsewhere = connectPanelChannel<TestProtocol>({
      name: 'devframes:test',
      window: asWindow(panelWin),
      targets: [asWindow(hostWin)],
      instanceId: 'some-other-tab',
      ...fastHello,
      functions: defaultPanelFunctions,
    })
    try {
      await expect(pinnedElsewhere.whenConnected(100)).rejects.toMatchObject({ code: 'timeout' })

      const pinnedHere = connectPanelChannel<TestProtocol>({
        name: 'devframes:test',
        window: asWindow(panelWin),
        targets: [asWindow(hostWin)],
        instanceId: pageScript.instanceId,
        ...fastHello,
        functions: defaultPanelFunctions,
      })
      try {
        await pinnedHere.whenConnected(2000)
      }
      finally {
        pinnedHere.close()
      }
    }
    finally {
      pinnedElsewhere.close()
      pageScript.close()
    }
  })

  it('stays connecting and warns when the panel has nowhere to handshake', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lonely = connectPanelChannel<TestProtocol>({
      name: `devframes:test-lonely-${Math.random()}`,
      window: false,
      heartbeat: false,
      functions: defaultPanelFunctions,
    })
    try {
      expect(lonely.status).toBe('connecting')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no handshake targets'))
      await expect(lonely.whenConnected(50)).rejects.toMatchObject({ code: 'timeout' })
    }
    finally {
      warn.mockRestore()
      lonely.close()
    }
  })

  it('rejects buffered calls with a status-aware timeout', async () => {
    const lonely = connectPanelChannel<TestProtocol>({
      name: `devframes:test-lonely-${Math.random()}`,
      window: false,
      heartbeat: false,
      callTimeoutMs: 50,
      functions: defaultPanelFunctions,
    })
    try {
      const rejection = await lonely.call('echo', 'nobody').catch(error => error)
      expect(rejection).toBeInstanceOf(InPageChannelError)
      expect(rejection.code).toBe('timeout')
      expect(rejection.message).toContain('is the page script loaded?')
    }
    finally {
      lonely.close()
    }
  })

  it('rejects pending work when the channel closes', async () => {
    const lonely = connectPanelChannel<TestProtocol>({
      name: `devframes:test-lonely-${Math.random()}`,
      window: false,
      heartbeat: false,
      functions: defaultPanelFunctions,
    })
    const pending = lonely.call('echo', 'never')
    const waiting = lonely.whenConnected()
    lonely.close()
    await expect(pending).rejects.toMatchObject({ code: 'closed' })
    await expect(waiting).rejects.toMatchObject({ code: 'closed' })
    expect(lonely.status).toBe('closed')
  })
})
