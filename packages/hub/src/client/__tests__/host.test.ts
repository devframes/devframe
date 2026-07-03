import type { DevframeRpcClient } from 'devframe/client'
import type { SharedState } from 'devframe/utils/shared-state'
import type { DevframeDockEntry } from '../../types/docks'
import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it, vi } from 'vitest'
import { getDevframeClientContext } from '../context'
import { createDevframeClientHost } from '../host'

interface StubSharedState<T> extends SharedState<T> {
  /** Replace the state wholesale and emit `updated` (simulates a server patch). */
  push: (next: T) => void
}

function createStubSharedState<T>(initial: T): StubSharedState<T> {
  let state = initial
  const events = createEventEmitter<any>()
  return {
    value: () => state as any,
    on: events.on,
    mutate: (fn) => {
      fn(state)
      events.emit('updated', state, undefined, 'test')
    },
    patch: () => {},
    syncIds: new Set(),
    push(next) {
      state = next
      events.emit('updated', state, undefined, 'test')
    },
  }
}

function createStubRpc() {
  const calls: any[][] = []
  const states = new Map<string, StubSharedState<any>>()
  const rpc = {
    sharedState: {
      async get(key: string, options?: { initialValue?: any }) {
        if (!states.has(key))
          states.set(key, createStubSharedState(options?.initialValue))
        return states.get(key)!
      },
    },
    call: async (...args: any[]) => {
      calls.push(args)
      if (args[0] === 'hub:messages:add')
        return { id: 'msg-1', timestamp: 1, from: 'browser', ...args[1] }
      return `rpc:${args[0]}`
    },
  } as unknown as DevframeRpcClient
  return { rpc, calls, states }
}

function iframeEntry(id: string, extra?: Record<string, unknown>): DevframeDockEntry {
  return { id, title: id, icon: 'ph:cube', type: 'iframe', url: `/__${id}/`, ...extra } as DevframeDockEntry
}

describe('createDevframeClientHost', () => {
  it('publishes the global client context with the full surface', async () => {
    const { rpc } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })

    expect(getDevframeClientContext()).toBe(host.context)
    expect(host.context.clientType).toBe('standalone')
    expect(host.context.rpc).toBe(rpc)
    expect(host.context.panel.store.open).toBe(true)
    expect(host.context.when.context).toMatchObject({
      clientType: 'standalone',
      dockOpen: true,
      paletteOpen: false,
      dockSelectedId: '',
    })
    host.dispose()
  })

  it('reconciles dock entries from shared state and tracks per-entry state', async () => {
    const { rpc, states } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })
    const docksState = states.get('devframe:docks')!

    docksState.push([iframeEntry('one'), iframeEntry('two')])
    expect(host.context.docks.entries.map(e => e.id)).toEqual(['one', 'two'])
    expect(host.context.docks.getStateById('one')?.entryMeta.id).toBe('one')

    docksState.push([iframeEntry('two')])
    expect(host.context.docks.entries.map(e => e.id)).toEqual(['two'])
    expect(host.context.docks.getStateById('one')).toBeUndefined()
    host.dispose()
  })

  it('switches entries with activation/deactivation events and when-context updates', async () => {
    const { rpc, states } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })
    states.get('devframe:docks')!.push([iframeEntry('one'), iframeEntry('two')])

    const activated: string[] = []
    const deactivated: string[] = []
    for (const id of ['one', 'two']) {
      const state = host.context.docks.getStateById(id)!
      state.events.on('entry:activated', () => activated.push(id))
      state.events.on('entry:deactivated', () => deactivated.push(id))
    }

    expect(await host.context.docks.switchEntry('one')).toBe(true)
    expect(host.context.docks.selected?.id).toBe('one')
    expect(host.context.docks.getStateById('one')?.isActive).toBe(true)
    expect(host.context.when.context.dockSelectedId).toBe('one')

    expect(await host.context.docks.switchEntry('one')).toBe(false) // no-op
    expect(await host.context.docks.toggleEntry('two')).toBe(true)
    expect(await host.context.docks.toggleEntry('two')).toBe(true) // toggles off
    expect(activated).toEqual(['one', 'two'])
    expect(deactivated).toEqual(['one', 'two'])
    expect(host.context.docks.selected).toBeNull()
    host.dispose()
  })

  it('executes client commands locally and server commands over hub:commands:execute', async () => {
    const { rpc, calls } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })

    const ran: any[] = []
    const off = host.context.commands.register({
      id: 'test:client',
      title: 'Client',
      source: 'client',
      action: (...args: any[]) => {
        ran.push(args)
      },
    })

    await host.context.commands.execute('test:client', 1, 2)
    expect(ran).toEqual([[1, 2]])

    await expect(host.context.commands.execute('srv:cmd', 'x')).resolves.toBe('rpc:hub:commands:execute')
    expect(calls.at(-1)).toEqual(['hub:commands:execute', 'srv:cmd', 'x'])

    off()
    expect(host.context.commands.commands.find(c => c.id === 'test:client')).toBeUndefined()
    host.dispose()
  })

  it('imports a dock entry client script and hands it the script context', async () => {
    const { rpc, states, calls } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })

    const received: any[] = []
    ;(globalThis as any).__DF_TEST_SCRIPT__ = (ctx: any) => received.push(ctx)
    const dataUrl = `data:text/javascript,export default ctx => globalThis.__DF_TEST_SCRIPT__(ctx)`
    states.get('devframe:docks')!.push([
      iframeEntry('scripted', { clientScript: { importFrom: dataUrl } }),
    ])

    await vi.waitFor(() => expect(received).toHaveLength(1))
    const scriptCtx = received[0]
    expect(scriptCtx.current.entryMeta.id).toBe('scripted')
    expect(scriptCtx.rpc).toBe(rpc)

    // The messages client is scoped to the entry: `category` defaults to the
    // entry id, and the doc'd per-level shortcuts delegate to add().
    await scriptCtx.messages.add({ message: 'hello', level: 'info' })
    expect(calls.at(-1)).toEqual(['hub:messages:add', { message: 'hello', level: 'info', category: 'scripted' }])
    await scriptCtx.messages.warn('careful', { category: 'a11y' })
    expect(calls.at(-1)).toEqual(['hub:messages:add', { message: 'careful', level: 'warn', category: 'a11y' }])

    delete (globalThis as any).__DF_TEST_SCRIPT__
    host.dispose()
  })

  it('warns when a second host replaces a published context; dispose unpublishes it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { rpc } = createStubRpc()
      const first = await createDevframeClientHost({ rpc })
      expect(warn).not.toHaveBeenCalled()

      const second = await createDevframeClientHost({ rpc })
      expect(warn).toHaveBeenCalledOnce()
      expect(getDevframeClientContext()).toBe(second.context)

      // The first host no longer owns the published context — leave it alone.
      first.dispose()
      expect(getDevframeClientContext()).toBe(second.context)
      second.dispose()
      expect(getDevframeClientContext()).toBeUndefined()
    }
    finally {
      warn.mockRestore()
    }
  })
})
