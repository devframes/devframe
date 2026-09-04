import { describe, expectTypeOf, it } from 'vitest'
import { defineChannelFunction } from './index'
import { createPageScriptChannel } from './page-script'
import { connectPanelChannel } from './panel'

interface TestProtocol {
  pageScript: {
    echo: (value: string) => string
    sum: (a: number, b: number) => number
    save: (value: string) => Promise<void>
  }
  panel: {
    notify: (message: string) => void
  }
}

interface PageScriptOnlyProtocol {
  pageScript: {
    echo: (value: string) => string
  }
  panel: Record<string, never>
}

describe('Channel function definitions', () => {
  it('distinguishes event, query, and action definitions', () => {
    defineChannelFunction({ name: 'notify', type: 'event' })
    defineChannelFunction({ name: 'load', handler: () => 'value' })
    defineChannelFunction({ name: 'load', type: 'query', handler: () => 'value' })
    defineChannelFunction({ name: 'save', type: 'action', handler: () => {} })
  })

  it('requires handlers for request/response functions', () => {
    // @ts-expect-error Query functions require a handler.
    defineChannelFunction({ name: 'load', type: 'query' })
    // @ts-expect-error Action functions require a handler.
    defineChannelFunction({ name: 'save', type: 'action' })
  })
})

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

    it('requires every page-script function declaration', () => {
      // @ts-expect-error `functions` is required.
      createPageScriptChannel<TestProtocol>({ name: 'devframes:test' })

      createPageScriptChannel<TestProtocol>({
        name: 'devframes:test',
        // @ts-expect-error `sum` and `save` must be declared.
        functions: {
          echo: { handler: value => value },
        },
      })
    })

    it('allows event declarations to omit their handler', () => {
      createPageScriptChannel<TestProtocol>({
        name: 'devframes:test',
        functions: {
          echo: { type: 'query', handler: value => value },
          sum: { type: 'action', handler: (a, b) => a + b },
          save: { type: 'event' },
        },
      })

      createPageScriptChannel<TestProtocol>({
        name: 'devframes:test',
        functions: {
          // @ts-expect-error Request/response functions require a handler.
          echo: { type: 'query' },
          // @ts-expect-error Request/response functions require a handler.
          sum: { type: 'action' },
          save: { type: 'event' },
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
      expectTypeOf(channel.emit('notify', 'ready')).toEqualTypeOf<void>()

      // @ts-expect-error In-page script functions cannot be called on panels.
      channel.emit('echo', 'ready')
      // @ts-expect-error `notify` requires a string.
      channel.emit('notify', 42)
      // @ts-expect-error `notify` requires one argument.
      channel.emit('notify')
      // @ts-expect-error `notify` accepts one argument.
      channel.emit('notify', 'ready', 'extra')
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

    it('rejects calls when the protocol declares no panel functions', () => {
      const pageScriptOnlyChannel = createPageScriptChannel<PageScriptOnlyProtocol>({
        name: 'devframes:page-script-only',
        functions: {
          echo: { handler: value => value },
        },
      })

      // @ts-expect-error The protocol has no panel functions.
      pageScriptOnlyChannel.emit('notify', 'ready')
    })
  })

  describe('Event checking', () => {
    it('types runtime subscriptions to page-script functions', () => {
      const unsubscribe = channel.on('echo', (value) => {
        expectTypeOf(value).toEqualTypeOf<string>()
      })

      expectTypeOf(unsubscribe).toEqualTypeOf<() => void>()
      // @ts-expect-error Panel functions cannot be handled by the page script.
      channel.on('notify', () => {})
      // @ts-expect-error `echo` listeners receive a string.
      channel.on('echo', (value: number) => void value)
    })

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

    it('requires every panel function declaration', () => {
      // @ts-expect-error `functions` is required.
      connectPanelChannel<TestProtocol>({ name: 'devframes:test' })

      connectPanelChannel<TestProtocol>({
        name: 'devframes:test',
        // @ts-expect-error `notify` must be declared.
        functions: {},
      })
    })

    it('allows event declarations to omit their handler', () => {
      connectPanelChannel<TestProtocol>({
        name: 'devframes:test',
        functions: {
          notify: { type: 'event' },
        },
      })

      connectPanelChannel<TestProtocol>({
        name: 'devframes:test',
        functions: {
          // @ts-expect-error Request/response functions require a handler.
          notify: { type: 'action' },
        },
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

    it('accepts an explicitly empty panel function map', () => {
      connectPanelChannel<PageScriptOnlyProtocol>({
        name: 'devframes:page-script-only',
        functions: {},
      })

      connectPanelChannel<PageScriptOnlyProtocol>({
        name: 'devframes:page-script-only',
        functions: {
          // @ts-expect-error The protocol has no panel functions.
          notify: { handler: () => {} },
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
      expectTypeOf(channel.emit('echo', 'hello')).toEqualTypeOf<void>()
      expectTypeOf(channel.emit('sum', 1, 2)).toEqualTypeOf<void>()
      expectTypeOf(channel.emit('save', 'draft')).toEqualTypeOf<void>()

      // @ts-expect-error Panel functions cannot be emitted to the in-page script.
      channel.emit('notify', 'hello')
      // @ts-expect-error `echo` requires a string.
      channel.emit('echo', false)
      // @ts-expect-error `sum` requires two arguments.
      channel.emit('sum', 1)
    })

    it('types channel state', () => {
      expectTypeOf(channel.status).toEqualTypeOf<'connecting' | 'connected' | 'closed'>()
      expectTypeOf(channel.pageScript).toEqualTypeOf<{ instanceId: string } | undefined>()
      expectTypeOf(channel.whenConnected()).toEqualTypeOf<Promise<void>>()
      expectTypeOf(channel.whenConnected(1_000)).toEqualTypeOf<Promise<void>>()
    })
  })

  describe('Event checking', () => {
    it('types runtime subscriptions to panel functions', () => {
      const unsubscribe = channel.on('notify', (message) => {
        expectTypeOf(message).toEqualTypeOf<string>()
      })

      expectTypeOf(unsubscribe).toEqualTypeOf<() => void>()
      // @ts-expect-error Page-script functions cannot be handled by the panel.
      channel.on('echo', () => {})
      // @ts-expect-error `notify` listeners receive a string.
      channel.on('notify', (message: number) => void message)
    })

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
