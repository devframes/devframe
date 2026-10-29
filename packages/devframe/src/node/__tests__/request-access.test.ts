import { describe, expect, it, vi } from 'vitest'
import { createRequestAccess, normalizeRemoteAddress } from '../request-access'

describe('request access', () => {
  it('preserves defaults without requiring peer metadata', async () => {
    expect(await createRequestAccess(undefined)(undefined)).toBe(true)
  })

  it.each([
    ['127.0.0.1', '127.0.0.1'],
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['::FFFF:7f00:1', '127.0.0.1'],
    ['0:0:0:0:0:0:0:1', '::1'],
    ['2001:DB8::1', '2001:db8::1'],
    ['fe80:0:0:0:0:0:0:1%eth0', 'fe80::1%eth0'],
    ['localhost', undefined],
    [undefined, undefined],
  ])('normalizes %s', (address, expected) => {
    expect(normalizeRemoteAddress(address)).toBe(expected)
  })

  it('matches normalized addresses exactly', async () => {
    const access = createRequestAccess({ internalIPs: ['::ffff:127.0.0.1', '::1'] })
    expect(await access('127.0.0.1')).toBe(true)
    expect(await access('0:0:0:0:0:0:0:1')).toBe(true)
    expect(await access('127.0.0.2')).toBe(false)
    expect(await access('203.0.113.1')).toBe(false)
  })

  it('denies empty lists and missing peers', async () => {
    expect(await createRequestAccess({ internalIPs: [] })('127.0.0.1')).toBe(false)
    expect(await createRequestAccess({})(undefined)).toBe(false)
  })

  it.each([false, true])('supports sync and async callbacks returning %s', async (allowed) => {
    for (const authorize of [() => allowed, async () => allowed])
      expect(await createRequestAccess({ authorize })('127.0.0.1')).toBe(allowed)
  })

  it('runs callbacks only on authorization with a resolved peer', async () => {
    const authorize = vi.fn(() => true)
    const access = createRequestAccess({ authorize })
    expect(authorize).not.toHaveBeenCalled()
    expect(await access(undefined)).toBe(false)
    expect(authorize).not.toHaveBeenCalled()
    expect(await access('::ffff:127.0.0.1')).toBe(true)
    expect(authorize).toHaveBeenCalledWith({ remoteAddress: '127.0.0.1' })
  })

  it('requires both restrictions', async () => {
    const authorize = vi.fn(() => false)
    const access = createRequestAccess({ internalIPs: ['127.0.0.1'], authorize })
    expect(await access('::1')).toBe(false)
    expect(authorize).not.toHaveBeenCalled()
    expect(await access('127.0.0.1')).toBe(false)
  })

  it('propagates callback errors', async () => {
    const error = new Error('policy failed')
    const access = createRequestAccess({ authorize: () => {
      throw error
    } })
    await expect(access('127.0.0.1')).rejects.toBe(error)
  })
})
