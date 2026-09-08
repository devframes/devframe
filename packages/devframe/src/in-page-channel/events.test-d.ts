import type { ConnectPanelChannelOptions, CreatePageScriptChannelOptions, PageScriptChannel, PanelChannel } from './types'
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

it('requires function handlers and separate event declarations', () => {
  const options: CreatePageScriptChannelOptions<Protocol> = {
    name: 'test',
    functions: {
      save: { type: 'action', handler: (value) => {
        expectTypeOf(value).toEqualTypeOf<string>()
      } },
      reset: { type: 'action', handler: async () => {} },
    },
    events: { note: {} },
  }
  // @ts-expect-error Actions require handlers even when returning void.
  options.functions.save = { type: 'action' }
  // @ts-expect-error Functions cannot be declared as events.
  options.functions.reset = { type: 'event' }
  // @ts-expect-error Events belong in the events option.
  options.functions.note = { handler: () => {} }
  // @ts-expect-error Event declarations must be complete.
  options.events = {}
  // @ts-expect-error Functions belong in the functions option.
  options.events.save = {}
  options.events.note = { handler: (value, count) => {
    expectTypeOf(value).toEqualTypeOf<string>()
    expectTypeOf(count).toEqualTypeOf<number | undefined>()
  } }
  // @ts-expect-error Event handlers must match the declared arguments.
  options.events.note = { handler: (value: number) => void value }
  // @ts-expect-error Event declarations cannot be actions.
  options.events.note = { type: 'action', handler: () => {} }
})

it('supports omitted protocol sections without widening their keys', () => {
  interface FunctionsOnly { functions: { pageScript: { run: () => void } } }
  interface EventsOnly { events: { panel: { ready: () => void } } }
  const options: ConnectPanelChannelOptions<FunctionsOnly> = { name: 'test', functions: {}, events: {} }
  // @ts-expect-error This direction declares no events.
  options.events.ready = {}
  // @ts-expect-error This direction declares no functions.
  options.functions.run = { handler: () => {} }
  expectTypeOf<Parameters<PanelChannel<FunctionsOnly>['emit']>[0]>().toEqualTypeOf<never>()
  expectTypeOf<Parameters<PanelChannel<EventsOnly>['call']>[0]>().toEqualTypeOf<never>()
  expectTypeOf<Parameters<PageScriptChannel<EventsOnly>['on']>[0]>().toEqualTypeOf<never>()
})
