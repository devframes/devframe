import type { DevframeHubContext } from '../context'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REMOTE_CONNECTION_KEY } from 'devframe/constants'
import { getInternalContext } from 'devframe/node/hub-internals'
import { describe, expect, it, vi } from 'vitest'
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

    const first = host.values()[0]
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

    const second = host.values()[0]
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

    const entry = host.values()[0]
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
    const entry = host.values()[0]
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

    const entry = host.values()[0]
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

    const ids = host.values().map(entry => entry.id)
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

describe('devframeDockHost activate', () => {
  it('emits a dock:activate event carrying the id and params', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({ type: 'iframe', id: 'terminals', title: 'Terminals', icon: 'ph:terminal-window-duotone', url: '/__terminals/' })

    const activations: Array<{ dockId: string, params?: Record<string, unknown> }> = []
    host.events.on('dock:activate', a => activations.push(a))

    host.activate('terminals', { sessionId: 'sess-1' })
    expect(activations).toEqual([{ dockId: 'terminals', params: { sessionId: 'sess-1' } }])
  })

  it('still emits for an unknown dock but warns (DF8107, graceful)', () => {
    const host = new DevframeDocksHost(createContext())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const activations: string[] = []
      host.events.on('dock:activate', a => activations.push(a.dockId))

      host.activate('nope')
      expect(activations).toEqual(['nope'])
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0]!.join(' ')).toMatch(/unknown dock id/i)
    }
    finally {
      warn.mockRestore()
    }
  })
})

describe('devframeDockHost ~builtin category', () => {
  it('returns no docks until an integration registers one', () => {
    const host = new DevframeDocksHost(createContext())
    expect(host.values()).toEqual([])
  })

  it('preserves a ~builtin view without a category untouched', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: '~builtin',
      id: '~settings',
      title: 'Settings',
      icon: 'ph:gear-duotone',
    })

    const entry = host.values()[0]
    expect(entry).toMatchObject({ id: '~settings', type: '~builtin' })
    expect(entry.category).toBeUndefined()
  })

  it('preserves an explicit category on a ~builtin view', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: '~builtin',
      id: '~settings',
      title: 'Settings',
      icon: 'ph:gear-duotone',
      category: 'app',
    })

    expect(host.values()[0].category).toBe('app')
  })

  it('leaves a non-builtin view without a category untouched', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'iframe',
      id: 'app:overview',
      title: 'Overview',
      icon: 'ph:gauge-duotone',
      url: '/__app/',
    })

    expect(host.values()[0].category).toBeUndefined()
  })
})
