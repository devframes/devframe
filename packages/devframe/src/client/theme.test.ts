import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEVFRAME_EVENTS } from '../events'
import { provideDevframeTheme, watchDevframeTheme } from './theme'

const channel = DEVFRAME_EVENTS.postMessage.theme

function fixture() {
  const parent = new EventTarget() as Window
  const panel = new EventTarget() as Window
  const origin = 'https://panel.example'
  const parentOrigin = 'https://hub.example'
  const queue: (() => void)[] = []
  const send = (target: EventTarget, data: unknown, source: EventTarget, origin: string) => {
    target.dispatchEvent(Object.assign(new Event('message'), { data, source, origin }))
  }
  Object.assign(parent, {
    postMessage: (data: unknown) => queue.push(() => send(parent, data, panel, origin)),
  })
  Object.assign(panel, {
    parent,
    postMessage: (data: unknown, targetOrigin: string) => queue.push(() => {
      if (targetOrigin === '*' || targetOrigin === origin)
        send(panel, data, parent, parentOrigin)
    }),
  })
  // Model both browsing contexts and queued postMessage delivery without a DOM.
  const iframe = Object.assign(new EventTarget(), {
    contentWindow: panel,
    ownerDocument: { defaultView: parent } as Document,
  }) as HTMLIFrameElement
  vi.stubGlobal('window', panel)
  return {
    iframe,
    panel,
    parent,
    send,
    flush() {
      while (queue.length)
        queue.shift()!()
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('panel theme protocol', () => {
  it.each(['panel', 'provider'])('connects cross-origin when %s boots first', (first) => {
    const f = fixture()
    const changed = vi.fn()
    const startPanel = () => watchDevframeTheme(changed)
    const startProvider = () => provideDevframeTheme(f.iframe, { primaryColor: '#6b84fd' })
    if (first === 'panel') {
      startPanel()
      f.flush()
      startProvider()
    }
    else {
      startProvider()
      f.flush()
      startPanel()
    }
    f.flush()
    expect(changed).toHaveBeenLastCalledWith({ primaryColor: '#6b84fd' })
  })

  it('updates and clears the accent without changing other theme state', () => {
    const f = fixture()
    const provider = provideDevframeTheme(f.iframe, { primaryColor: '#6b84fd' })
    const changed = vi.fn()
    watchDevframeTheme(changed)
    f.flush()
    provider.update({ primaryColor: 'rebeccapurple' })
    f.flush()
    expect(changed).toHaveBeenLastCalledWith({ primaryColor: 'rebeccapurple' })
    provider.update({})
    f.flush()
    expect(changed).toHaveBeenLastCalledWith({ primaryColor: undefined })
  })

  it('offers no theme data until the iframe opts in', () => {
    const f = fixture()
    const received: unknown[] = []
    f.panel.addEventListener('message', event => received.push((event as MessageEvent).data))
    const provider = provideDevframeTheme(f.iframe, { primaryColor: 'blue' })
    provider.update({ primaryColor: 'red' })
    f.flush()
    expect(received).toEqual([{ channel, type: 'available' }])
  })

  it('requires a new document to opt in after navigation', () => {
    const f = fixture()
    const provider = provideDevframeTheme(f.iframe, { primaryColor: 'blue' })
    const changed = vi.fn()
    const stop = watchDevframeTheme(changed)
    f.flush()
    stop()
    f.iframe.dispatchEvent(new Event('load'))
    provider.update({ primaryColor: 'red' })
    f.flush()
    changed.mockClear()
    watchDevframeTheme(changed)
    f.flush()
    expect(changed).toHaveBeenLastCalledWith({ primaryColor: 'red' })
  })

  it('rejects theme updates from sibling windows and malformed messages', () => {
    const f = fixture()
    const changed = vi.fn()
    watchDevframeTheme(changed)
    f.send(f.panel, { channel, type: 'update', theme: { primaryColor: 'red' } }, new EventTarget(), 'https://hub.example')
    for (const data of [null, 'blue', { channel, type: 'update', theme: null }, { channel, type: 'update', theme: { primaryColor: 42 } }])
      f.send(f.panel, data, f.parent, 'https://hub.example')
    expect(changed).not.toHaveBeenCalled()
  })

  it('rejects requests from unrelated windows and opaque origins', () => {
    const f = fixture()
    const received: unknown[] = []
    f.panel.addEventListener('message', event => received.push((event as MessageEvent).data))
    provideDevframeTheme(f.iframe, { primaryColor: 'blue' })
    f.flush()
    received.length = 0
    f.send(f.parent, { channel, type: 'request' }, new EventTarget(), 'https://panel.example')
    f.send(f.parent, { channel, type: 'request' }, f.panel, 'null')
    f.flush()
    expect(received).toEqual([])
  })

  it('cleans up both ends and reconnects a preserved iframe to a new provider', () => {
    const f = fixture()
    const changed = vi.fn()
    const stop = watchDevframeTheme(changed)
    const provider = provideDevframeTheme(f.iframe, { primaryColor: 'blue' })
    f.flush()
    provider.dispose()
    changed.mockClear()
    provider.update({ primaryColor: 'red' })
    f.iframe.dispatchEvent(new Event('load'))
    f.flush()
    expect(changed).not.toHaveBeenCalled()
    const next = provideDevframeTheme(f.iframe, {})
    f.flush()
    expect(changed).toHaveBeenLastCalledWith({ primaryColor: undefined })
    stop()
    changed.mockClear()
    next.update({ primaryColor: 'red' })
    f.flush()
    expect(changed).not.toHaveBeenCalled()
  })

  it('leaves standalone SPAs and SSR untouched', () => {
    const changed = vi.fn()
    vi.stubGlobal('window', undefined)
    watchDevframeTheme(changed)()
    const standalone = { parent: undefined as unknown }
    standalone.parent = standalone
    vi.stubGlobal('window', standalone)
    watchDevframeTheme(changed)()
    expect(changed).not.toHaveBeenCalled()
  })
})
