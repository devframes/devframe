import type { DevframeHubContext } from '../context'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REMOTE_CONNECTION_KEY } from 'devframe/constants'
import { getInternalContext } from 'devframe/node/hub-internals'
import { describe, expect, it } from 'vitest'
import { parseRemoteConnection } from '../../client/remote'
import { DevframeDocksHost } from '../host-docks'

function createContext(): DevframeHubContext {
  const storageDir = mkdtempSync(join(tmpdir(), 'devframe-hub-docks-'))
  return {
    host: {
      mountStatic: () => {},
      resolveOrigin: () => 'http://localhost:5173',
      getStorageDir: () => storageDir,
    },
    // Minimal stubs so the built-in `~terminals`/`~messages` getters
    // (`when`/`badge`) can be evaluated without a full context.
    terminals: { sessions: new Map() },
    messages: { entries: new Map() },
  } as unknown as DevframeHubContext
}

describe('devframeDockHost remote URL enrichment', () => {
  it('preserves hash routes and replaces existing remote descriptors', () => {
    const context = createContext()
    getInternalContext(context).wsEndpoint = { url: 'ws://localhost:4173' }
    const host = new DevframeDocksHost(context)

    host.register({
      type: 'iframe',
      id: 'remote',
      title: 'Remote',
      icon: 'ph:cube-duotone',
      url: 'https://remote.test/app#/inspect?tab=state',
      remote: true,
    })

    const first = host.values({ includeBuiltin: false })[0]
    expect(first.type).toBe('iframe')
    const firstUrl = first.type === 'iframe' ? first.url : ''
    expect(firstUrl).toContain(`#/inspect?tab=state&${REMOTE_CONNECTION_KEY}=`)
    expect(parseRemoteConnection(firstUrl)).toMatchObject({
      backend: 'websocket',
      websocket: 'ws://localhost:4173',
      origin: 'http://localhost:5173',
    })

    host.update({
      type: 'iframe',
      id: 'remote',
      title: 'Remote',
      icon: 'ph:cube-duotone',
      url: firstUrl,
      remote: true,
    })

    const second = host.values({ includeBuiltin: false })[0]
    const secondUrl = second.type === 'iframe' ? second.url : ''
    expect(secondUrl.match(new RegExp(REMOTE_CONNECTION_KEY, 'g'))).toHaveLength(1)
    expect(secondUrl).toContain('#/inspect?tab=state&')
  })

  it('preserves non-route fragments with the ampersand descriptor form', () => {
    const context = createContext()
    getInternalContext(context).wsEndpoint = { url: 'ws://localhost:4173' }
    const host = new DevframeDocksHost(context)

    host.register({
      type: 'iframe',
      id: 'remote',
      title: 'Remote',
      icon: 'ph:cube-duotone',
      url: 'https://remote.test/app#section',
      remote: true,
    })

    const entry = host.values({ includeBuiltin: false })[0]
    const url = entry.type === 'iframe' ? entry.url : ''
    expect(url).toContain(`#section&${REMOTE_CONNECTION_KEY}=`)
    expect(parseRemoteConnection(url)?.websocket).toBe('ws://localhost:4173')
  })
})

describe('devframeDockHost grouping', () => {
  it('registers a group entry: stored, projected, and emitted', () => {
    const host = new DevframeDocksHost(createContext())
    const emitted: string[] = []
    host.events.on('dock:entry:updated', entry => emitted.push(entry.id))

    host.register({
      type: 'group',
      id: 'nuxt',
      title: 'Nuxt',
      icon: 'logos:nuxt-icon',
      category: 'framework',
      defaultChildId: 'nuxt:overview',
    })

    expect(host.views.has('nuxt')).toBe(true)
    expect(emitted).toEqual(['nuxt'])
    const entry = host.values({ includeBuiltin: false })[0]
    expect(entry.type).toBe('group')
    expect(entry).toMatchObject({ id: 'nuxt', defaultChildId: 'nuxt:overview' })
  })

  it('round-trips a member groupId through values()', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'iframe',
      id: 'nuxt:overview',
      title: 'Overview',
      icon: 'ph:gauge-duotone',
      url: '/__nuxt-overview/',
      groupId: 'nuxt',
    })

    const entry = host.values({ includeBuiltin: false })[0]
    expect(entry.groupId).toBe('nuxt')
  })

  it('tolerates a member registered before its group (orphan tolerance)', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'iframe',
      id: 'nuxt:overview',
      title: 'Overview',
      icon: 'ph:gauge-duotone',
      url: '/__nuxt-overview/',
      groupId: 'nuxt',
    })
    host.register({
      type: 'group',
      id: 'nuxt',
      title: 'Nuxt',
      icon: 'logos:nuxt-icon',
    })

    const ids = host.values({ includeBuiltin: false }).map(entry => entry.id)
    expect(ids).toEqual(['nuxt:overview', 'nuxt'])
  })

  it('rejects an entry that groups itself (DF8103)', () => {
    const host = new DevframeDocksHost(createContext())
    expect(() => host.register({
      type: 'iframe',
      id: 'self',
      title: 'Self',
      icon: 'ph:gauge-duotone',
      url: '/__self/',
      groupId: 'self',
    })).toThrow('cannot set groupId to its own id')
  })

  it('rejects a nested group (DF8104)', () => {
    const host = new DevframeDocksHost(createContext())
    expect(() => host.register({
      type: 'group',
      id: 'child-group',
      title: 'Child Group',
      icon: 'logos:nuxt-icon',
      groupId: 'parent-group',
    })).toThrow('nested groups are unsupported')
  })

  it('updates a group entry while preserving type and rejecting id change', () => {
    const host = new DevframeDocksHost(createContext())
    const handle = host.register({
      type: 'group',
      id: 'nuxt',
      title: 'Nuxt',
      icon: 'logos:nuxt-icon',
    })

    handle.update({ title: 'Nuxt DevTools' })
    const entry = host.views.get('nuxt')!
    expect(entry.type).toBe('group')
    expect(entry.title).toBe('Nuxt DevTools')

    expect(() => handle.update({ id: 'other' })).toThrow('Cannot change the id of dock "nuxt" to "other"')
  })

  it('rejects updating a dock that is not registered (DF8102)', () => {
    const host = new DevframeDocksHost(createContext())
    expect(() => host.update({
      type: 'iframe',
      id: 'ghost',
      title: 'Ghost',
      icon: 'ph:ghost-duotone',
      url: '/__ghost/',
    })).toThrow('Dock with id "ghost" is not registered and cannot be updated')
  })
})

describe('devframeDockHost built-in gating', () => {
  it('includes all three built-ins by default', () => {
    const host = new DevframeDocksHost(createContext())
    const ids = host.values().map(entry => entry.id)
    expect(ids).toEqual(['~terminals', '~messages', '~settings'])
  })

  it('treats an empty builtinDocks map as all-enabled', () => {
    const host = new DevframeDocksHost(createContext(), {})
    const ids = host.values().map(entry => entry.id)
    expect(ids).toEqual(['~terminals', '~messages', '~settings'])
  })

  it('omits the built-ins gated with `false`, keeping the rest', () => {
    const host = new DevframeDocksHost(createContext(), { terminals: false, messages: false })
    const ids = host.values().map(entry => entry.id)
    expect(ids).toEqual(['~settings'])
  })

  it('keeps an explicitly-enabled built-in and drops an omitted-as-false sibling', () => {
    const host = new DevframeDocksHost(createContext(), { terminals: true, settings: false })
    const ids = host.values().map(entry => entry.id)
    expect(ids).toEqual(['~terminals', '~messages'])
  })

  it('keeps user views ahead of gated built-ins', () => {
    const host = new DevframeDocksHost(createContext(), { messages: false, settings: false })
    host.register({
      type: 'iframe',
      id: 'app:overview',
      title: 'Overview',
      icon: 'ph:gauge-duotone',
      url: '/__app/',
    })

    const ids = host.values().map(entry => entry.id)
    expect(ids).toEqual(['app:overview', '~terminals'])
  })

  it('drops every built-in when includeBuiltin is false, regardless of gating', () => {
    const host = new DevframeDocksHost(createContext(), { terminals: true, messages: true, settings: true })
    expect(host.values({ includeBuiltin: false })).toEqual([])
  })
})

describe('devframeDockHost dynamic `when`', () => {
  it('resolves a function `when` on every values() call, reflecting the current return value', () => {
    const host = new DevframeDocksHost(createContext())
    let hidden = false

    host.register({
      type: 'iframe',
      id: 'app:overview',
      title: 'Overview',
      icon: 'ph:gauge-duotone',
      url: '/__app/',
      when: () => (hidden ? 'false' : undefined),
    })

    expect(host.values({ includeBuiltin: false })[0].when).toBeUndefined()

    hidden = true
    expect(host.values({ includeBuiltin: false })[0].when).toBe('false')

    hidden = false
    expect(host.values({ includeBuiltin: false })[0].when).toBeUndefined()
  })

  it('resolves boolean `when`: false -> \'false\', true -> undefined', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'iframe',
      id: 'app:hidden',
      title: 'Hidden',
      icon: 'ph:gauge-duotone',
      url: '/__hidden/',
      when: false,
    })
    host.register({
      type: 'iframe',
      id: 'app:shown',
      title: 'Shown',
      icon: 'ph:gauge-duotone',
      url: '/__shown/',
      when: true,
    })

    const entries = host.values({ includeBuiltin: false })
    expect(entries.find(e => e.id === 'app:hidden')!.when).toBe('false')
    expect(entries.find(e => e.id === 'app:shown')!.when).toBeUndefined()
  })

  it('passes a string `when` through unchanged', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'iframe',
      id: 'app:embedded-only',
      title: 'Embedded Only',
      icon: 'ph:gauge-duotone',
      url: '/__embedded-only/',
      when: 'clientType == embedded',
    })

    expect(host.values({ includeBuiltin: false })[0].when).toBe('clientType == embedded')
  })

  it('does not mutate the stored entry when resolving a function `when`', () => {
    const host = new DevframeDocksHost(createContext())
    const whenFn = () => 'false' as const
    host.register({
      type: 'iframe',
      id: 'app:overview',
      title: 'Overview',
      icon: 'ph:gauge-duotone',
      url: '/__app/',
      when: whenFn,
    })

    host.values({ includeBuiltin: false })
    expect(host.views.get('app:overview')!.when).toBe(whenFn)
  })
})
