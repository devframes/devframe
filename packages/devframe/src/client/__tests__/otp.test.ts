import { afterEach, describe, expect, it, vi } from 'vitest'
import { authenticateWithUrlOtp, consumeOtpFromUrl, readOtpFromUrl } from '../otp'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('otp url helpers', () => {
  it('reads the OTP from the page URL fragment (default param)', () => {
    vi.stubGlobal('location', { hash: '#devframe_otp=123456&x=1', href: 'http://localhost:3000/#devframe_otp=123456&x=1' })
    expect(readOtpFromUrl()).toBe('123456')
  })

  it('supports a custom param name', () => {
    vi.stubGlobal('location', { hash: '#code=999', href: 'http://localhost:3000/#code=999' })
    expect(readOtpFromUrl('code')).toBe('999')
  })

  it('returns undefined when the param is absent and is safe without location', () => {
    vi.stubGlobal('location', { hash: '#x=1', href: 'http://localhost:3000/#x=1' })
    expect(readOtpFromUrl()).toBeUndefined()
    vi.stubGlobal('location', undefined)
    expect(readOtpFromUrl()).toBeUndefined()
    expect(() => consumeOtpFromUrl()).not.toThrow()
  })

  it('ignores an OTP left in the query string (fragment-only)', () => {
    vi.stubGlobal('location', { hash: '', search: '?devframe_otp=123456', href: 'http://localhost:3000/?devframe_otp=123456' })
    expect(readOtpFromUrl()).toBeUndefined()
  })

  it('consume reads then strips the OTP via history.replaceState, keeping other params', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { hash: '#devframe_otp=123456&x=1', href: 'http://localhost:3000/#devframe_otp=123456&x=1' })
    vi.stubGlobal('history', { state: { a: 1 }, replaceState })

    expect(consumeOtpFromUrl()).toBe('123456')
    expect(replaceState).toHaveBeenCalledTimes(1)
    const [state, , href] = replaceState.mock.calls[0]
    expect(state).toEqual({ a: 1 })
    expect(href).toBe('http://localhost:3000/#x=1')
  })

  it('clears the fragment entirely when the OTP was its only param', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { hash: '#devframe_otp=123456', href: 'http://localhost:3000/#devframe_otp=123456' })
    vi.stubGlobal('history', { state: null, replaceState })

    expect(consumeOtpFromUrl()).toBe('123456')
    const [, , href] = replaceState.mock.calls[0]
    expect(href).toBe('http://localhost:3000/')
  })

  it('does not touch the URL when no OTP is present', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { hash: '#x=1', href: 'http://localhost:3000/#x=1' })
    vi.stubGlobal('history', { state: null, replaceState })

    expect(consumeOtpFromUrl()).toBeUndefined()
    expect(replaceState).not.toHaveBeenCalled()
  })
})

describe('authenticateWithUrlOtp', () => {
  it('exchanges the OTP via the client and resolves true on success', async () => {
    vi.stubGlobal('location', { hash: '#devframe_otp=123456', href: 'http://localhost:3000/#devframe_otp=123456' })
    vi.stubGlobal('history', { state: null, replaceState: vi.fn() })
    const requestTrustWithCode = vi.fn().mockResolvedValue(true)

    const ok = await authenticateWithUrlOtp({ isTrusted: false, requestTrustWithCode })

    expect(requestTrustWithCode).toHaveBeenCalledWith('123456')
    expect(ok).toBe(true)
  })

  it('returns false (and does not exchange) when no OTP is present', async () => {
    vi.stubGlobal('location', { hash: '', href: 'http://localhost:3000/' })
    const requestTrustWithCode = vi.fn()

    const ok = await authenticateWithUrlOtp({ isTrusted: false, requestTrustWithCode })

    expect(requestTrustWithCode).not.toHaveBeenCalled()
    expect(ok).toBe(false)
  })

  it('skips the exchange but still consumes the OTP when already trusted', async () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { hash: '#devframe_otp=123456', href: 'http://localhost:3000/#devframe_otp=123456' })
    vi.stubGlobal('history', { state: null, replaceState })
    const requestTrustWithCode = vi.fn()

    const ok = await authenticateWithUrlOtp({ isTrusted: true, requestTrustWithCode })

    expect(ok).toBe(true)
    expect(requestTrustWithCode).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledTimes(1)
  })
})
