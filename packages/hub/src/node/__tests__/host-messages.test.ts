import type { DevframeHubContext } from '../context'
import { describe, expect, it } from 'vitest'
import { DevframeMessagesHost } from '../host-messages'

describe('devframeMessagesHost', () => {
  it('caps removal history', async () => {
    const host = new DevframeMessagesHost({} as DevframeHubContext)

    for (let i = 0; i < 1005; i++) {
      const id = `message:${i}`
      await host.add({
        id,
        level: 'info',
        message: id,
      })
      await host.remove(id)
    }

    expect(host.removals).toHaveLength(1000)
    expect(host.removals[0].id).toBe('message:5')
    expect(host.removals.at(-1)?.id).toBe('message:1004')
  })

  it('provides per-level shortcuts that delegate to add()', async () => {
    const host = new DevframeMessagesHost({} as DevframeHubContext)

    const handle = await host.info('booted', { category: 'lifecycle' })
    expect(handle.entry).toMatchObject({
      message: 'booted',
      level: 'info',
      category: 'lifecycle',
      from: 'server',
    })

    await host.error('boom')
    const levels = [
      ...host.entries.values(),
    ].map(e => e.level)
    expect(levels).toEqual(['info', 'error'])
  })

  describe('listSince', () => {
    it.each([1, 2, 3])('replaces a foreign cursor when the new clock is %s', async (count) => {
      const previous = new DevframeMessagesHost({} as DevframeHubContext)
      await previous.info('old first', { id: 'old:1' })
      await previous.info('old second', { id: 'old:2' })
      const cursor = previous.listSince()

      const current = new DevframeMessagesHost({} as DevframeHubContext)
      for (let i = 0; i < count; i++)
        await current.info(`new ${i}`, { id: `new:${i}` })

      const result = current.listSince(cursor.version, cursor.instanceId)
      expect(result.full).toBe(true)
      expect(result.entries.map(entry => entry.id)).toEqual(Array.from({ length: count }, (_, i) => `new:${i}`))
      expect(result.instanceId).not.toBe(cursor.instanceId)
    })

    it('returns a full snapshot for a legacy numeric-only cursor', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.info('first', { id: 'first' })
      const { version } = host.listSince()
      await host.info('second', { id: 'second' })

      const result = host.listSince(version)
      expect(result.full).toBe(true)
      expect(result.entries.map(entry => entry.id)).toEqual(['first', 'second'])
    })

    it('returns a full snapshot without a cursor', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })
      await host.add({ id: 'b', level: 'warn', message: 'b' })

      const result = host.listSince()
      expect(result.full).toBe(true)
      expect(result.entries.map(e => e.id)).toEqual(['a', 'b'])
      expect(result.removedIds).toEqual([])
      expect(result.version).toBe(2)
    })

    it('returns only entries modified after the cursor', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })
      const { version, instanceId } = host.listSince()

      await host.add({ id: 'b', level: 'info', message: 'b' })
      await host.update('a', { message: 'a2' })

      const delta = host.listSince(version, instanceId)
      expect(delta.full).toBe(false)
      expect(delta.entries.map(e => e.id).sort()).toEqual(['a', 'b'])
      expect(delta.removedIds).toEqual([])
      expect(delta.version).toBe(3)
    })

    it('reports removals after the cursor', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })
      await host.add({ id: 'b', level: 'info', message: 'b' })
      const { version, instanceId } = host.listSince()

      await host.remove('a')

      const delta = host.listSince(version, instanceId)
      expect(delta.full).toBe(false)
      expect(delta.entries).toEqual([])
      expect(delta.removedIds).toEqual(['a'])
    })

    it('reports every id after clear', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })
      await host.add({ id: 'b', level: 'info', message: 'b' })
      const { version, instanceId } = host.listSince()

      await host.clear()

      const delta = host.listSince(version, instanceId)
      expect(delta.entries).toEqual([])
      expect(delta.removedIds.sort()).toEqual(['a', 'b'])
    })

    it('returns an empty delta when nothing changed', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })
      const { version, instanceId } = host.listSince()

      const delta = host.listSince(version, instanceId)
      expect(delta.full).toBe(false)
      expect(delta.entries).toEqual([])
      expect(delta.removedIds).toEqual([])
      expect(delta.version).toBe(version)
    })

    it('falls back to a full snapshot when the cursor predates trimmed removals', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'stale', level: 'info', message: 'stale cursor target' })
      const { version, instanceId } = host.listSince()

      // Overflow the removal log so records after `version` get trimmed.
      for (let i = 0; i < 1005; i++) {
        const id = `message:${i}`
        await host.add({ id, level: 'info', message: id })
        await host.remove(id)
      }

      const result = host.listSince(version, instanceId)
      expect(result.full).toBe(true)
      expect(result.entries.map(e => e.id)).toEqual(['stale'])
      expect(result.removedIds).toEqual([])
    })

    it('falls back to a full snapshot for a cursor ahead of the clock', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })

      const result = host.listSince(9999, host.listSince().instanceId)
      expect(result.full).toBe(true)
      expect(result.entries.map(e => e.id)).toEqual(['a'])
    })
  })
})
