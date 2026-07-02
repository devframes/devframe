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
    const levels = [...host.entries.values()].map(e => e.level)
    expect(levels).toEqual(['info', 'error'])
  })
})
