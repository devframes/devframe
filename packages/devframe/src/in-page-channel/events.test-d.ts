import type { PageScriptChannel, PanelChannel } from './types'
import { expectTypeOf, it } from 'vitest'

interface Protocol {
  functions: {
    pageScript: { save: (value: string) => void, reset: () => Promise<void> }
    panel: { save: (value: string) => void, reset: () => Promise<void> }
  }
  events: {
    pageScript: { note: (value: string, count?: number) => void }
    panel: { notify: (message: string) => void }
  }
}

declare const pageScript: PageScriptChannel<Protocol>
declare const panel: PanelChannel<Protocol>

it('distinguishes void actions from declared events in both directions', () => {
  expectTypeOf(panel.call('save', 'draft')).toEqualTypeOf<Promise<void>>()
  expectTypeOf(panel.call('reset')).toEqualTypeOf<Promise<void>>()
  const peer = pageScript.panels[0]!
  expectTypeOf(peer.call('save', 'draft')).toEqualTypeOf<Promise<void>>()
  expectTypeOf(peer.call('reset')).toEqualTypeOf<Promise<void>>()
  expectTypeOf(panel.emit('note', 'hello', 2)).toEqualTypeOf<void>()
  expectTypeOf(pageScript.emit('notify', 'hello')).toEqualTypeOf<void>()
  expectTypeOf(pageScript.on('note', (value, count) => {
    expectTypeOf(value).toEqualTypeOf<string>()
    expectTypeOf(count).toEqualTypeOf<number | undefined>()
  })).toEqualTypeOf<() => void>()
  // @ts-expect-error Events cannot be called as functions.
  panel.call('note', 'hello')
  // @ts-expect-error Events cannot be called on panel peers.
  peer.call('notify', 'hello')
  // @ts-expect-error A void action is still a function.
  panel.emit('save', 'draft')
  // @ts-expect-error An asynchronous void action is still a function.
  panel.emit('reset')
  // @ts-expect-error The deprecated alias has the same restriction.
  panel.callEvent('save', 'draft')
  // @ts-expect-error A panel void action is still a function.
  pageScript.emit('save', 'draft')
  // @ts-expect-error A panel asynchronous void action is still a function.
  pageScript.callEvent('reset')
  // @ts-expect-error Functions cannot receive event listeners.
  pageScript.on('save', () => {})
  // @ts-expect-error Functions cannot receive event listeners.
  panel.on('reset', () => {})
})
