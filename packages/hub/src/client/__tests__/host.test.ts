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
  const definitions = new Map<string, { name: string, type: string, handler?: (...args: any[]) => any }>()
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
    client: {
      definitions,
      register(fn: { name: string, type: string, handler?: (...args: any[]) => any }) {
        definitions.set(fn.name, fn)
      },
    },
  } as unknown as DevframeRpcClient
  return { rpc, calls, states, definitions }
}

function iframeEntry(id: string, extra?: Record<string, unknown>): DevframeDockEntry {
  return { id, title: id, icon: 'ph:cube', type: 'iframe', url: `/__${id}/`, ...extra } as DevframeDockEntry
}

function groupEntry(id: string, extra?: Record<string, unknown>): DevframeDockEntry {
  return { id, title: id, icon: 'ph:folder', type: 'group', ...extra } as DevframeDockEntry
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

  it('keeps a `visibility: false` entry in the raw model, activatable by id', async () => {
    const { rpc, states } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })
    states.get('devframe:docks')!.push([
      iframeEntry('anchor', { subTabs: { protocol: 'postmessage' }, visibility: 'false' }),
      iframeEntry('visible'),
    ])

    // `visibility` is a render-only hint for the UI layer — the hub itself
    // never filters `entries`/`getStateById`/`switchEntry` by it, so the
    // anchor stays fully reachable.
    expect(host.context.docks.entries.map(e => e.id)).toEqual(['anchor', 'visible'])
    expect(host.context.docks.getStateById('anchor')).toBeDefined()
    expect(await host.context.docks.switchEntry('anchor')).toBe(true)
    expect(host.context.docks.selected?.id).toBe('anchor')
    host.dispose()
  })

  it('groups entries by category — grouped members bucket under their group, orphans by their own', async () => {
    const { rpc, states } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })

    states.get('devframe:docks')!.push([
      // (a) member with groupId + its own category → outer bucket = group's category ('framework'),
      // and its own 'app' category is reinterpreted as an in-group sub-category.
      groupEntry('nuxt', { category: 'framework' }),
      iframeEntry('nuxt:overview', { groupId: 'nuxt', category: 'app' }),
      // (b) group with no category → members bucket to 'default'.
      groupEntry('misc'),
      iframeEntry('misc:one', { groupId: 'misc', category: 'web' }),
      // (c) orphan member (groupId with no registered group) → its own category ('web').
      iframeEntry('orphan', { groupId: 'ghost', category: 'web' }),
      // plain ungrouped entry keeps its own category.
      iframeEntry('plain', { category: 'app' }),
    ])

    const grouped = Object.fromEntries(
      host.context.docks.groupedEntries.map(([cat, entries]) => [cat, entries.map(e => e.id)]),
    )

    // (a) grouped member lands under the group's category, alongside the group button.
    expect(grouped.framework).toEqual(['nuxt', 'nuxt:overview'])
    // (b) group without a category, and its member, bucket to 'default'.
    expect(grouped.default).toEqual(['misc', 'misc:one'])
    // (c) orphan + plain keep their own categories.
    expect(grouped.web).toEqual(['orphan'])
    expect(grouped.app).toEqual(['plain'])

    // Categories sort by DEFAULT_CATEGORIES_ORDER — framework first.
    expect(host.context.docks.groupedEntries.map(([cat]) => cat)).toEqual([
      'framework',
      'default',
      'app',
      'web',
    ])
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

  it('switches the active dock when the hub broadcasts devframe:docks:activate', async () => {
    const { rpc, states, definitions } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })
    states.get('devframe:docks')!.push([iframeEntry('one'), iframeEntry('devframes_plugin_terminals')])

    // Simulate the hub's server→client broadcast.
    const handler = definitions.get('devframe:docks:activate')!.handler!
    handler({ dockId: 'devframes_plugin_terminals', params: { sessionId: 'sess-1' } })
    await vi.waitFor(() => expect(host.context.docks.selectedId).toBe('devframes_plugin_terminals'))

    // Unknown dock ids degrade to a no-op (the previous selection stands).
    handler({ dockId: 'ghost' })
    await new Promise(r => setTimeout(r, 0))
    expect(host.context.docks.selectedId).toBe('devframes_plugin_terminals')
    host.dispose()
  })

  it('registers, updates, and disposes client-only docks merged with server entries', async () => {
    const { rpc, states } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })
    const docks = host.context.docks
    states.get('devframe:docks')!.push([iframeEntry('server')])

    // Client-only registration is merged with the server entries.
    const handle = docks.register(iframeEntry('client'))
    expect(docks.entries.map(e => e.id)).toEqual(['server', 'client'])
    expect(docks.getStateById('client')?.entryMeta.id).toBe('client')

    // It survives a server-driven reconcile and is switchable.
    states.get('devframe:docks')!.push([iframeEntry('server'), iframeEntry('server2')])
    expect(docks.entries.map(e => e.id)).toEqual(['server', 'server2', 'client'])
    expect(await docks.switchEntry('client')).toBe(true)
    expect(docks.selected?.id).toBe('client')

    // A registered client dock is never pushed into shared state (client-only).
    expect((states.get('devframe:docks')!.value() as DevframeDockEntry[]).map(e => e.id))
      .toEqual(['server', 'server2'])

    // Patch in place; id is immutable.
    handle.update({ title: 'Renamed' })
    expect(docks.getStateById('client')?.entryMeta.title).toBe('Renamed')
    expect(() => handle.update({ id: 'other' } as any)).toThrow()

    // Duplicate id throws unless forced; update() requires a prior registration.
    expect(() => docks.register(iframeEntry('client'))).toThrow()
    expect(() => docks.register(iframeEntry('client'), true)).not.toThrow()
    expect(() => docks.update(iframeEntry('ghost'))).toThrow()

    // Disposing removes it from the merge.
    handle.dispose()
    expect(docks.entries.map(e => e.id)).toEqual(['server', 'server2'])
    expect(docks.getStateById('client')).toBeUndefined()
    host.dispose()
  })

  it('imports the client script of a client-registered dock', async () => {
    const { rpc } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })

    const received: any[] = []
    ;(globalThis as any).__DF_TEST_CLIENT_DOCK__ = (ctx: any) => received.push(ctx)
    const dataUrl = `data:text/javascript,export default ctx => globalThis.__DF_TEST_CLIENT_DOCK__(ctx)`
    host.context.docks.register(iframeEntry('local', { clientScript: { importFrom: dataUrl } }))

    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0].current.entryMeta.id).toBe('local')

    delete (globalThis as any).__DF_TEST_CLIENT_DOCK__
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
