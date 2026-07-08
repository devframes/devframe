import { randomDigits, randomToken, timingSafeEqual } from 'devframe/utils/crypto-token'
import { createSharedState } from 'devframe/utils/shared-state'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exchangeTempAuthCode,
  getTempAuthCode,
  refreshTempAuthCode,
  verifyAuthToken,
} from '../state'

function makeStorage() {
  return createSharedState({ initialValue: { trusted: {} as Record<string, any> } }) as any
}
function makeSession() {
  return { meta: {} } as any
}
const INFO = { ua: 'test-ua', origin: 'http://localhost' }

beforeEach(() => {
  refreshTempAuthCode()
})

describe('exchangeTempAuthCode', () => {
  it('exchanges a valid code for a token, trusts the session, and rotates the code', () => {
    const storage = makeStorage()
    const session = makeSession()
    const code = getTempAuthCode()
    const token = exchangeTempAuthCode(code, session, INFO, storage)
    expect(token).toBeTruthy()
    expect(session.meta.isTrusted).toBe(true)
    expect(session.meta.clientAuthToken).toBe(token)
    expect(storage.value().trusted[token!]).toMatchObject({ authToken: token, origin: INFO.origin })
    // Code is rotated so it can't be replayed.
    expect(getTempAuthCode()).not.toBe(code)
    // The now-stale code no longer works.
    expect(exchangeTempAuthCode(code, makeSession(), INFO, storage)).toBeNull()
  })

  it('rotates the code after 5 failed attempts', () => {
    const storage = makeStorage()
    const code = getTempAuthCode()
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++)
      expect(exchangeTempAuthCode(wrong, makeSession(), INFO, storage)).toBeNull()
    // Code rotated by the lockout — the original valid code is now dead.
    expect(getTempAuthCode()).not.toBe(code)
    expect(exchangeTempAuthCode(code, makeSession(), INFO, storage)).toBeNull()
  })

  it('rejects and rotates an expired code', () => {
    vi.useFakeTimers()
    try {
      refreshTempAuthCode()
      const code = getTempAuthCode()
      vi.advanceTimersByTime(5 * 60_000 + 1) // past TEMP_AUTH_CODE_TTL
      const storage = makeStorage()
      expect(exchangeTempAuthCode(code, makeSession(), INFO, storage)).toBeNull()
      expect(getTempAuthCode()).not.toBe(code)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('verifyAuthToken', () => {
  it('verifies a known token and rejects an unknown one', () => {
    const storage = makeStorage()
    const token = exchangeTempAuthCode(getTempAuthCode(), makeSession(), INFO, storage)!
    const session = makeSession()
    expect(verifyAuthToken(token, session, storage)).toBe(true)
    expect(session.meta.isTrusted).toBe(true)
    expect(verifyAuthToken('not-a-real-token', makeSession(), storage)).toBe(false)
  })
})

describe('crypto-token', () => {
  it('timingSafeEqual: equal for identical, false for different length/content', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
  it('randomDigits returns the requested length of decimal digits', () => {
    const d = randomDigits(6)
    expect(d).toHaveLength(6)
    expect(d).toMatch(/^\d{6}$/)
  })
  it('randomToken returns hex of the expected length', () => {
    expect(randomToken(16)).toMatch(/^[0-9a-f]{32}$/)
  })
})
