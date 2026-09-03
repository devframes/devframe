import { afterEach, describe, expect, it, vi } from 'vitest'

describe('auth state import', () => {
  afterEach(() => {
    vi.doUnmock('devframe/utils/crypto-token')
    vi.resetModules()
  })

  it('does not generate an authentication code at module evaluation', async () => {
    const randomDigits = vi.fn(() => '123456')

    vi.doMock('devframe/utils/crypto-token', () => ({
      randomDigits,
      randomToken: vi.fn(),
      timingSafeEqual: vi.fn(),
    }))

    await import('../state')

    expect(randomDigits).not.toHaveBeenCalled()
  })
})
