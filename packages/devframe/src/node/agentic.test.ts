import { Diagnostic } from 'devframe/utils/nostics'
import { describe, expect, it, vi } from 'vitest'
import { importAgenticMcp, isAgenticInstalled } from './agentic'

describe('isAgenticInstalled', () => {
  it('resolves the installed optional peer without importing it', () => {
    expect(isAgenticInstalled()).toBe(true)
  })

  it('is false for an unresolvable package', () => {
    expect(isAgenticInstalled('@devframes/definitely-not-installed')).toBe(false)
  })
})

describe('importAgenticMcp', () => {
  it('maps a failed load to a thrown DF0079', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const error = await importAgenticMcp('@devframes/definitely-not-installed/mcp').catch(e => e)
      expect(error).toBeInstanceOf(Diagnostic)
      expect((error as Diagnostic).code).toBe('DF0079')
    }
    finally {
      warn.mockRestore()
    }
  })
})
