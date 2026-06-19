import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAuthCodeFromUrl, readAuthCodeFromUrl } from '../auth-url'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth-url helpers', () => {
  it('reads the pairing code from the page URL query string', () => {
    vi.stubGlobal('location', { search: '?devframe_auth=123456&x=1', href: 'http://localhost:3000/?devframe_auth=123456&x=1' })
    expect(readAuthCodeFromUrl('devframe_auth')).toBe('123456')
  })

  it('returns undefined when the param is absent or empty', () => {
    vi.stubGlobal('location', { search: '?x=1', href: 'http://localhost:3000/?x=1' })
    expect(readAuthCodeFromUrl('devframe_auth')).toBeUndefined()
  })

  it('is safe when location is unavailable', () => {
    vi.stubGlobal('location', undefined)
    expect(readAuthCodeFromUrl('devframe_auth')).toBeUndefined()
    expect(() => clearAuthCodeFromUrl('devframe_auth')).not.toThrow()
  })

  it('strips the pairing code from the URL via history.replaceState, keeping other params', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { search: '?devframe_auth=123456&x=1', href: 'http://localhost:3000/?devframe_auth=123456&x=1' })
    vi.stubGlobal('history', { state: { a: 1 }, replaceState })

    clearAuthCodeFromUrl('devframe_auth')

    expect(replaceState).toHaveBeenCalledTimes(1)
    const [state, , href] = replaceState.mock.calls[0]
    expect(state).toEqual({ a: 1 })
    expect(href).toBe('http://localhost:3000/?x=1')
  })

  it('does nothing when the param is not present in the URL', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { href: 'http://localhost:3000/?x=1' })
    vi.stubGlobal('history', { state: null, replaceState })

    clearAuthCodeFromUrl('devframe_auth')

    expect(replaceState).not.toHaveBeenCalled()
  })
})
