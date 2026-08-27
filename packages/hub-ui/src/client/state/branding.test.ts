import { afterEach, describe, expect, it } from 'vitest'
import { setBranding, useBrandingBackground } from './branding'
import { setColorSchemePreference } from './color-mode'

afterEach(() => {
  setBranding({})
  setColorSchemePreference('auto')
})

describe('useBrandingBackground', () => {
  it('preserves an empty dark value for CSS validation', () => {
    expect.assertions(1)

    setColorSchemePreference('dark')
    setBranding({ background: { light: 'white', dark: '' } })

    expect(useBrandingBackground().value).toBe('')
  })
})
