import { afterEach, describe, expect, it, vi } from 'vitest'
import { authenticateWithUrlOtp, consumeOtpFromUrl, readOtpFromUrl } from '../otp'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('otp url helpers', () => {
  it('reads the OTP from the page URL query string (default param)', () => {
    vi.stubGlobal('location', { search: '?devframe_otp=123456&x=1', href: 'http://localhost:3000/?devframe_otp=123456&x=1' })
    expect(readOtpFromUrl()).toBe('123456')
  })

  it('supports a custom param name', () => {
    vi.stubGlobal('location', { search: '?code=999', href: 'http://localhost:3000/?code=999' })
    expect(readOtpFromUrl('code')).toBe('999')
  })

  it('returns undefined when the param is absent and is safe without location', () => {
    vi.stubGlobal('location', { search: '?x=1', href: 'http://localhost:3000/?x=1' })
    expect(readOtpFromUrl()).toBeUndefined()
    vi.stubGlobal('location', undefined)
    expect(readOtpFromUrl()).toBeUndefined()
    expect(() => consumeOtpFromUrl()).not.toThrow()
  })

  it('consume reads then strips the OTP via history.replaceState, keeping other params', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { search: '?devframe_otp=123456&x=1', href: 'http://localhost:3000/?devframe_otp=123456&x=1' })
    vi.stubGlobal('history', { state: { a: 1 }, replaceState })

    expect(consumeOtpFromUrl()).toBe('123456')
    expect(replaceState).toHaveBeenCalledTimes(1)
    const [state, , href] = replaceState.mock.calls[0]
    expect(state).toEqual({ a: 1 })
    expect(href).toBe('http://localhost:3000/?x=1')
  })

  it('does not touch the URL when no OTP is present', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { search: '?x=1', href: 'http://localhost:3000/?x=1' })
    vi.stubGlobal('history', { state: null, replaceState })

    expect(consumeOtpFromUrl()).toBeUndefined()
    expect(replaceState).not.toHaveBeenCalled()
  })
})

describe('authenticateWithUrlOtp', () => {
  it('exchanges the OTP via the client and resolves true on success', async () => {
    vi.stubGlobal('location', { search: '?devframe_otp=123456', href: 'http://localhost:3000/?devframe_otp=123456' })
    vi.stubGlobal('history', { state: null, replaceState: vi.fn() })
    const requestTrustWithCode = vi.fn().mockResolvedValue(true)

    const ok = await authenticateWithUrlOtp({ isTrusted: false, requestTrustWithCode })

    expect(requestTrustWithCode).toHaveBeenCalledWith('123456')
    expect(ok).toBe(true)
  })

  it('returns false (and does not exchange) when no OTP is present', async () => {
    vi.stubGlobal('location', { search: '', href: 'http://localhost:3000/' })
    const requestTrustWithCode = vi.fn()

    const ok = await authenticateWithUrlOtp({ isTrusted: false, requestTrustWithCode })

    expect(requestTrustWithCode).not.toHaveBeenCalled()
    expect(ok).toBe(false)
  })

  it('skips the exchange but still consumes the OTP when already trusted', async () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { search: '?devframe_otp=123456', href: 'http://localhost:3000/?devframe_otp=123456' })
    vi.stubGlobal('history', { state: null, replaceState })
    const requestTrustWithCode = vi.fn()

    const ok = await authenticateWithUrlOtp({ isTrusted: true, requestTrustWithCode })

    expect(ok).toBe(true)
    expect(requestTrustWithCode).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledTimes(1)
  })
})
