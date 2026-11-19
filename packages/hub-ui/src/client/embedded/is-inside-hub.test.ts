import { CLIENT_CONTEXT_KEY } from '@devframes/hub/client'
import { describe, expect, it } from 'vitest'
import { isInsideHub } from './is-inside-hub'

describe('embedded dock parent', () => {
  it('mounts in top-level applications', () => {
    const win = { parent: {} }
    Object.assign(win, { parent: win })
    expect(isInsideHub(win)).toBe(false)
  })

  it('mounts in ordinary same-origin application previews', () => {
    expect(isInsideHub({ parent: {} })).toBe(false)
  })

  it('mounts in cross-origin application previews', () => {
    const parent = Object.defineProperty({}, CLIENT_CONTEXT_KEY, {
      get() { throw new DOMException('Cross-origin access', 'SecurityError') },
    })
    expect(isInsideHub({ parent })).toBe(false)
  })

  it('suppresses duplicate docks inside Hub panels', () => {
    const parent = { [CLIENT_CONTEXT_KEY]: {} }
    expect(isInsideHub({ parent })).toBe(true)
  })
})
