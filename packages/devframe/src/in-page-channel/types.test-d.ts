import type { InPageChannelProtocol } from './types'
import { describe, expectTypeOf, it } from 'vitest'
import { createPageScriptChannel } from './page-script'
import { connectPanelChannel } from './panel'

interface TestProtocol extends InPageChannelProtocol {
  pageScript: {
    echo: (value: string) => string
    sum: (a: number, b: number) => number
    save: (value: string) => Promise<void>
  }
  panel: {
    notify: (message: string) => void
  }
}

describe('in-page channel function definitions', () => {
  it('infers page-script handlers from the protocol name', () => {
    createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      functions: {
        echo: {
          handler: (value) => {
            expectTypeOf(value).toEqualTypeOf<string>()
            return value.toUpperCase()
          },
        },
        sum: {
          handler: (a, b) => {
            expectTypeOf(a).toEqualTypeOf<number>()
            expectTypeOf(b).toEqualTypeOf<number>()
            return a + b
          },
        },
        save: {
          handler: (value) => {
            expectTypeOf(value).toEqualTypeOf<string>()
          },
        },
      },
    })
  })

  it('infers panel handlers from the protocol name', () => {
    const { port1 } = new MessageChannel()
    const channel = connectPanelChannel<TestProtocol>({
      name: 'devframes:test',
      window: false,
      transport: port1,
      functions: {
        notify: {
          handler: (message) => {
            expectTypeOf(message).toEqualTypeOf<string>()
          },
        },
      },
    })
    channel.close()
  })

  it('requires every function from the local protocol side', () => {
    createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      // @ts-expect-error `sum` and `save` are required.
      functions: {
        echo: { handler: value => value },
      },
    })
  })

  it('rejects keys from the remote side', () => {
    createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      functions: {
        echo: { handler: value => value },
        sum: { handler: (a, b) => a + b },
        save: { handler: () => {} },
        // @ts-expect-error `notify` is implemented by panels.
        notify: { handler: (message: string) => void message },
      },
    })
  })

  it('rejects handlers incompatible with the named protocol function', () => {
    createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      functions: {
        echo: {
          // @ts-expect-error `echo` accepts and returns a string.
          handler: (value: number) => value,
        },
        sum: { handler: (a, b) => a + b },
        save: { handler: () => {} },
      },
    })
  })
})

describe('page-script channel types', () => {
  it('types calls to panel functions', () => {
    const channel = createPageScriptChannel<TestProtocol>({ name: 'devframes:test' })

    expectTypeOf(channel.callEvent('notify', 'ready')).toEqualTypeOf<void>()

    // @ts-expect-error Page-script functions cannot be called on panels.
    channel.callEvent('echo', 'ready')
    // @ts-expect-error `notify` requires a string.
    channel.callEvent('notify', 42)
    // @ts-expect-error `notify` requires one argument.
    channel.callEvent('notify')
    // @ts-expect-error `notify` accepts one argument.
    channel.callEvent('notify', 'ready', 'extra')
  })

  it('types connected panel peers and their calls', () => {
    const channel = createPageScriptChannel<TestProtocol>({ name: 'devframes:test' })
    const unsubscribe = channel.events.on('panel:connected', (panel) => {
      expectTypeOf(panel.id).toEqualTypeOf<string>()
      expectTypeOf(panel.call('notify', 'ready')).toEqualTypeOf<Promise<void>>()
      expectTypeOf(panel.close()).toEqualTypeOf<void>()

      // @ts-expect-error Page-script functions cannot be called on a panel peer.
      panel.call('sum', 1, 2)
      // @ts-expect-error `notify` requires a string.
      panel.call('notify', false)
    })

    expectTypeOf(unsubscribe).toEqualTypeOf<() => void>()
  })

  it('types disconnected panel peers and one-time listeners', () => {
    const channel = createPageScriptChannel<TestProtocol>({ name: 'devframes:test' })
    const unsubscribe = channel.events.once('panel:disconnected', (panel) => {
      expectTypeOf(panel.id).toEqualTypeOf<string>()
      expectTypeOf(panel.call('notify', 'bye')).toEqualTypeOf<Promise<void>>()
    })

    expectTypeOf(unsubscribe).toEqualTypeOf<() => void>()

    // @ts-expect-error Unknown page-script channel lifecycle event.
    channel.events.on('status:updated', () => {})
  })
})

describe('panel channel types', () => {
  it('types calls and their resolved results', () => {
    const channel = connectPanelChannel<TestProtocol>({ name: 'devframes:test' })

    expectTypeOf(channel.call('echo', 'hello')).toEqualTypeOf<Promise<string>>()
    expectTypeOf(channel.call('sum', 1, 2)).toEqualTypeOf<Promise<number>>()
    expectTypeOf(channel.call('save', 'draft')).toEqualTypeOf<Promise<void>>()

    // @ts-expect-error Panel functions cannot be called on the page script.
    channel.call('notify', 'hello')
    // @ts-expect-error `echo` requires a string.
    channel.call('echo', 42)
    // @ts-expect-error `sum` requires two arguments.
    channel.call('sum', 1)
    // @ts-expect-error `save` accepts one argument.
    channel.call('save', 'draft', 'extra')
  })

  it('types fire-and-forget calls to page-script functions', () => {
    const channel = connectPanelChannel<TestProtocol>({ name: 'devframes:test' })

    expectTypeOf(channel.callEvent('echo', 'hello')).toEqualTypeOf<void>()
    expectTypeOf(channel.callEvent('sum', 1, 2)).toEqualTypeOf<void>()
    expectTypeOf(channel.callEvent('save', 'draft')).toEqualTypeOf<void>()

    // @ts-expect-error Panel functions cannot be emitted to the page script.
    channel.callEvent('notify', 'hello')
    // @ts-expect-error `echo` requires a string.
    channel.callEvent('echo', false)
    // @ts-expect-error `sum` requires two arguments.
    channel.callEvent('sum', 1)
  })

  it('types status listeners and channel state', () => {
    const channel = connectPanelChannel<TestProtocol>({ name: 'devframes:test' })
    const unsubscribe = channel.events.on('status:updated', (status) => {
      expectTypeOf(status).toEqualTypeOf<'connecting' | 'connected' | 'closed'>()
    })

    expectTypeOf(unsubscribe).toEqualTypeOf<() => void>()
    expectTypeOf(channel.status).toEqualTypeOf<'connecting' | 'connected' | 'closed'>()
    expectTypeOf(channel.pageScript).toEqualTypeOf<{ instanceId: string } | undefined>()
    expectTypeOf(channel.whenConnected()).toEqualTypeOf<Promise<void>>()
    expectTypeOf(channel.whenConnected(1_000)).toEqualTypeOf<Promise<void>>()

    // @ts-expect-error Unknown panel channel lifecycle event.
    channel.events.on('panel:connected', () => {})
    // @ts-expect-error `status:updated` listeners receive the status.
    channel.events.on('status:updated', (status: number) => void status)
  })
})
