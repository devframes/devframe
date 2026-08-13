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

  it('dedupes identical re-adds: no update event, no clock tick', async () => {
    const host = new DevframeMessagesHost({} as DevframeHubContext)
    const updates: string[] = []
    host.events.on('message:updated', entry => void updates.push(entry.id))

    const input = { id: 'scan', level: 'info' as const, message: 'No issues found', labels: ['a11y'] }
    await host.add(input)
    const tickAfterAdd = host.lastModified.get('scan')

    // The periodic-producer pattern: the same entry mirrored again and again.
    await host.add({ ...input })
    await host.add({ ...input, labels: ['a11y'] })
    expect(updates).toEqual([])
    expect(host.lastModified.get('scan')).toBe(tickAfterAdd)

    // A real change still updates and emits.
    await host.add({ ...input, message: '2 issues found' })
    expect(updates).toEqual(['scan'])
    expect(host.entries.get('scan')?.message).toBe('2 issues found')
    expect(host.lastModified.get('scan')).not.toBe(tickAfterAdd)
  })

  it('an identical re-add carrying autoDelete still resets the keep-alive timer', async () => {
    const host = new DevframeMessagesHost({} as DevframeHubContext)
    const updates: string[] = []
    host.events.on('message:updated', entry => void updates.push(entry.id))

    await host.add({ id: 'alive', level: 'info', message: 'still here', autoDelete: 50 })
    // Keep-alive re-adds: content identical, timer restarted each time.
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 30))
      await host.add({ id: 'alive', level: 'info', message: 'still here', autoDelete: 50 })
    }
    // 90ms elapsed — well past the 50ms window — yet the entry survives.
    expect(host.entries.has('alive')).toBe(true)
    expect(updates).toEqual([])
    // Once the re-adds stop, the timer finally fires.
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(host.entries.has('alive')).toBe(false)
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
    const levels = [...host.entries.values()].map(e => e.level)
    expect(levels).toEqual(['info', 'error'])
  })

  describe('listSince', () => {
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
      const { version } = host.listSince()

      await host.add({ id: 'b', level: 'info', message: 'b' })
      await host.update('a', { message: 'a2' })

      const delta = host.listSince(version)
      expect(delta.full).toBe(false)
      expect(delta.entries.map(e => e.id).sort()).toEqual(['a', 'b'])
      expect(delta.removedIds).toEqual([])
      expect(delta.version).toBe(3)
    })

    it('reports removals after the cursor', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })
      await host.add({ id: 'b', level: 'info', message: 'b' })
      const { version } = host.listSince()

      await host.remove('a')

      const delta = host.listSince(version)
      expect(delta.full).toBe(false)
      expect(delta.entries).toEqual([])
      expect(delta.removedIds).toEqual(['a'])
    })

    it('reports every id after clear', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })
      await host.add({ id: 'b', level: 'info', message: 'b' })
      const { version } = host.listSince()

      await host.clear()

      const delta = host.listSince(version)
      expect(delta.entries).toEqual([])
      expect(delta.removedIds.sort()).toEqual(['a', 'b'])
    })

    it('returns an empty delta when nothing changed', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })
      const { version } = host.listSince()

      const delta = host.listSince(version)
      expect(delta.full).toBe(false)
      expect(delta.entries).toEqual([])
      expect(delta.removedIds).toEqual([])
      expect(delta.version).toBe(version)
    })

    it('falls back to a full snapshot when the cursor predates trimmed removals', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'stale', level: 'info', message: 'stale cursor target' })
      const { version } = host.listSince()

      // Overflow the removal log so records after `version` get trimmed.
      for (let i = 0; i < 1005; i++) {
        const id = `message:${i}`
        await host.add({ id, level: 'info', message: id })
        await host.remove(id)
      }

      const result = host.listSince(version)
      expect(result.full).toBe(true)
      expect(result.entries.map(e => e.id)).toEqual(['stale'])
      expect(result.removedIds).toEqual([])
    })

    it('falls back to a full snapshot for a cursor ahead of the clock', async () => {
      const host = new DevframeMessagesHost({} as DevframeHubContext)
      await host.add({ id: 'a', level: 'info', message: 'a' })

      const result = host.listSince(9999)
      expect(result.full).toBe(true)
      expect(result.entries.map(e => e.id)).toEqual(['a'])
    })
  })
})
