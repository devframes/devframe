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
