import { describe, expect, it, vi } from 'vitest'
import { DevframeServicesHostImpl } from '../host-services'

describe('devframeServicesHost', () => {
  it('provides and gets a service', () => {
    const services = new DevframeServicesHostImpl()
    const impl = { register: () => {} }
    services.provide('my-plugin:thing', impl)
    expect(services.get('my-plugin:thing')).toBe(impl)
    expect(services.has('my-plugin:thing')).toBe(true)
    expect(services.keys()).toEqual(['my-plugin:thing'])
  })

  it('throws DF0037 on duplicate provide', () => {
    const services = new DevframeServicesHostImpl()
    services.provide('a:s', 1)
    expect(() => services.provide('a:s', 2)).toThrowError(/already provided under "a:s"/)
  })

  it('revoke removes only the matching provider', () => {
    const services = new DevframeServicesHostImpl()
    const revoke = services.provide('a:s', 1)
    revoke()
    expect(services.has('a:s')).toBe(false)
    // A stale revoke from a previous provider must not remove a newer one.
    services.provide('a:s', 2)
    revoke()
    expect(services.get('a:s')).toBe(2)
  })

  it('whenAvailable fires immediately when already provided', () => {
    const services = new DevframeServicesHostImpl()
    services.provide('a:s', 41)
    const spy = vi.fn()
    services.whenAvailable('a:s', spy)
    expect(spy).toHaveBeenCalledWith(41)
  })

  it('whenAvailable fires on later provide (order independence)', () => {
    const services = new DevframeServicesHostImpl()
    const spy = vi.fn()
    services.whenAvailable('a:s', spy)
    expect(spy).not.toHaveBeenCalled()
    services.provide('a:s', 'late')
    expect(spy).toHaveBeenCalledWith('late')
  })

  it('whenAvailable re-fires after revoke + re-provide, and unsubscribes', () => {
    const services = new DevframeServicesHostImpl()
    const spy = vi.fn()
    const unsubscribe = services.whenAvailable('a:s', spy)
    const revoke = services.provide('a:s', 1)
    revoke()
    services.provide('a:s', 2)
    expect(spy).toHaveBeenCalledTimes(2)
    unsubscribe()
    services.get('a:s') // no-op
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
