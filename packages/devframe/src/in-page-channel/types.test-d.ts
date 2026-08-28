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

describe('In-page script channel', () => {
  const channel = createPageScriptChannel<TestProtocol>({
    name: 'devframes:test',
    functions: {
      echo: { handler: value => value },
      sum: { handler: (a, b) => a + b },
      save: { handler: () => {} },
    },
  })

  describe('Function definitions', () => {
    it('infers handlers from the protocol', () => {
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

    it('requires every in-page script function', () => {
      // @ts-expect-error `functions` is required.
      createPageScriptChannel<TestProtocol>({ name: 'devframes:test' })

      createPageScriptChannel<TestProtocol>({
        name: 'devframes:test',
        // @ts-expect-error `sum` and `save` are required.
        functions: {
          echo: { handler: value => value },
        },
      })
    })

    it('rejects panel functions', () => {
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

    it('rejects incompatible handlers', () => {
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

  describe('Function calling', () => {
    it('types fire-and-forget calls to panel functions', () => {
      expectTypeOf(channel.callEvent('notify', 'ready')).toEqualTypeOf<void>()

      // @ts-expect-error In-page script functions cannot be called on panels.
      channel.callEvent('echo', 'ready')
      // @ts-expect-error `notify` requires a string.
      channel.callEvent('notify', 42)
      // @ts-expect-error `notify` requires one argument.
      channel.callEvent('notify')
      // @ts-expect-error `notify` accepts one argument.
      channel.callEvent('notify', 'ready', 'extra')
    })

    it('types calls to connected panels', () => {
      const panel = channel.panels[0]!

      expectTypeOf(panel.call('notify', 'ready')).toEqualTypeOf<Promise<void>>()
      expectTypeOf(panel.close()).toEqualTypeOf<void>()

      // @ts-expect-error In-page script functions cannot be called on a panel peer.
      panel.call('sum', 1, 2)
      // @ts-expect-error `notify` requires a string.
      panel.call('notify', false)
    })
  })

  describe('Event checking', () => {
    it('types panel connection events', () => {
      const unsubscribeConnected = channel.events.on('panel:connected', (panel) => {
        expectTypeOf(panel.id).toEqualTypeOf<string>()
        expectTypeOf(panel.call('notify', 'ready')).toEqualTypeOf<Promise<void>>()
      })
      const unsubscribeDisconnected = channel.events.on('panel:disconnected', (panel) => {
        expectTypeOf(panel.id).toEqualTypeOf<string>()
        expectTypeOf(panel.call('notify', 'bye')).toEqualTypeOf<Promise<void>>()
      })

      expectTypeOf(unsubscribeConnected).toEqualTypeOf<() => void>()
      expectTypeOf(unsubscribeDisconnected).toEqualTypeOf<() => void>()
    })

    it('rejects panel channel events', () => {
      // @ts-expect-error Unknown in-page script channel lifecycle event.
      channel.events.on('status:updated', () => {})
    })
  })
})

describe('Panel channel', () => {
  const channel = connectPanelChannel<TestProtocol>({
    name: 'devframes:test',
    functions: {
      notify: { handler: () => {} },
    },
  })

  describe('Function definitions', () => {
    it('infers handlers from the protocol', () => {
      const { port1 } = new MessageChannel()
      const inferredChannel = connectPanelChannel<TestProtocol>({
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
      inferredChannel.close()
    })

    it('requires every panel function', () => {
      // @ts-expect-error `functions` is required.
      connectPanelChannel<TestProtocol>({ name: 'devframes:test' })

      connectPanelChannel<TestProtocol>({
        name: 'devframes:test',
        // @ts-expect-error `notify` is required.
        functions: {},
      })
    })

    it('rejects in-page script functions', () => {
      connectPanelChannel<TestProtocol>({
        name: 'devframes:test',
        functions: {
          notify: { handler: () => {} },
          // @ts-expect-error `echo` is implemented by the in-page script.
          echo: { handler: (value: string) => value },
        },
      })
    })

    it('rejects incompatible handlers', () => {
      connectPanelChannel<TestProtocol>({
        name: 'devframes:test',
        functions: {
          notify: {
            // @ts-expect-error `notify` accepts a string.
            handler: (message: number) => void message,
          },
        },
      })
    })
  })

  describe('Function calling', () => {
    it('types calls and their resolved results', () => {
      expectTypeOf(channel.call('echo', 'hello')).toEqualTypeOf<Promise<string>>()
      expectTypeOf(channel.call('sum', 1, 2)).toEqualTypeOf<Promise<number>>()
      expectTypeOf(channel.call('save', 'draft')).toEqualTypeOf<Promise<void>>()

      // @ts-expect-error Panel functions cannot be called on the in-page script.
      channel.call('notify', 'hello')
      // @ts-expect-error `echo` requires a string.
      channel.call('echo', 42)
      // @ts-expect-error `sum` requires two arguments.
      channel.call('sum', 1)
      // @ts-expect-error `save` accepts one argument.
      channel.call('save', 'draft', 'extra')
    })

    it('types fire-and-forget calls to in-page script functions', () => {
      expectTypeOf(channel.callEvent('echo', 'hello')).toEqualTypeOf<void>()
      expectTypeOf(channel.callEvent('sum', 1, 2)).toEqualTypeOf<void>()
      expectTypeOf(channel.callEvent('save', 'draft')).toEqualTypeOf<void>()

      // @ts-expect-error Panel functions cannot be emitted to the in-page script.
      channel.callEvent('notify', 'hello')
      // @ts-expect-error `echo` requires a string.
      channel.callEvent('echo', false)
      // @ts-expect-error `sum` requires two arguments.
      channel.callEvent('sum', 1)
    })

    it('types channel state', () => {
      expectTypeOf(channel.status).toEqualTypeOf<'connecting' | 'connected' | 'closed'>()
      expectTypeOf(channel.pageScript).toEqualTypeOf<{ instanceId: string } | undefined>()
      expectTypeOf(channel.whenConnected()).toEqualTypeOf<Promise<void>>()
      expectTypeOf(channel.whenConnected(1_000)).toEqualTypeOf<Promise<void>>()
    })
  })

  describe('Event checking', () => {
    it('types status events', () => {
      const unsubscribe = channel.events.on('status:updated', (status) => {
        expectTypeOf(status).toEqualTypeOf<'connecting' | 'connected' | 'closed'>()
      })

      expectTypeOf(unsubscribe).toEqualTypeOf<() => void>()
    })

    it('rejects in-page script channel events and incompatible listeners', () => {
      // @ts-expect-error Unknown panel channel lifecycle event.
      channel.events.on('panel:connected', () => {})
      // @ts-expect-error `status:updated` listeners receive the status.
      channel.events.on('status:updated', (status: number) => void status)
    })
  })
})
