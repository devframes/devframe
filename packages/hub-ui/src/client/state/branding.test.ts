import type { DevframeBranding } from '../../types'
import { afterEach, describe, expect, it } from 'vitest'
import { setBranding, useBrandingBackground } from './branding'
import { setColorSchemePreference } from './color-mode'

afterEach(() => {
  setBranding({})
  setColorSchemePreference('auto')
})

describe('useBrandingBackground', () => {
  it.each([
    { viewerContext: 'standalone' as const, preference: 'light' as const, expected: 'standalone-light' },
    { viewerContext: 'standalone' as const, preference: 'dark' as const, expected: 'standalone-dark' },
    { viewerContext: 'iframe' as const, preference: 'light' as const, expected: 'iframe-light' },
    { viewerContext: 'iframe' as const, preference: 'dark' as const, expected: 'iframe-dark' },
  ])('resolves the $preference background in the $viewerContext viewer', ({ viewerContext, preference, expected }) => {
    expect.assertions(1)

    setColorSchemePreference(preference)
    setBranding({
      background: {
        standalone: { light: 'standalone-light', dark: 'standalone-dark' },
        iframe: { light: 'iframe-light', dark: 'iframe-dark' },
      },
    })

    expect(useBrandingBackground(viewerContext).value).toBe(expected)
  })

  it('falls back to the standalone background when no iframe value is configured', () => {
    expect.assertions(1)

    setBranding({ background: { standalone: 'shared' } })

    expect(useBrandingBackground('iframe').value).toBe('shared')
  })

  it.each(['standalone', 'iframe'] as const)('applies a flat background in the %s viewer', (viewerContext) => {
    expect.assertions(1)

    setBranding({ background: 'shared' })

    expect(useBrandingBackground(viewerContext).value).toBe('shared')
  })

  it('preserves an empty dark value for CSS validation', () => {
    expect.assertions(1)

    setColorSchemePreference('dark')
    setBranding({ background: { light: 'white', dark: '' } })

    expect(useBrandingBackground('standalone').value).toBe('')
  })

  it('ignores a null background from an invalid runtime configuration', () => {
    expect.assertions(1)

    setBranding({ background: null } as unknown as DevframeBranding)

    expect(useBrandingBackground('iframe').value).toBeUndefined()
  })
})
