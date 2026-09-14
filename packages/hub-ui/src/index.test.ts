import type { DevframeHubContext } from '@devframes/hub/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createUi } from './index'

function createContext(): DevframeHubContext {
  return { staticConfig: {} } as DevframeHubContext
}

describe('createUi branding background', () => {
  it('defines the viewer background through a static token', () => {
    expect.assertions(6)

    const html = readFileSync(fileURLToPath(new URL('../dist/client/standalone/index.html', import.meta.url)), 'utf8')
    // The build minifies the inline <style>, so match against the CSS with all
    // whitespace stripped rather than its authored spacing.
    const css = html.replace(/\s+/g, '')

    expect(html).not.toContain('__hub-ui.css')
    expect(css).toContain('color-scheme:light')
    expect(css).toContain('--devframes-viewer-background:#fff')
    expect(css).toContain('--devframes-viewer-background:#111')
    expect(css).toContain('background:var(--devframes-viewer-background)')
    expect(css).not.toMatch(/html\.viewer-background-custom\{[^}]*color-scheme:normal/)
  })

  it('preserves the default viewer background', () => {
    expect.assertions(2)

    const context = createContext()
    const ui = createUi()
    ui.setup?.(context)

    expect(context.staticConfig.ui).toEqual({ branding: {} })
    expect(ui.assets).toBeUndefined()
  })

  it('publishes a CSS viewer background with the branding', () => {
    expect.assertions(2)

    const context = createContext()
    const ui = createUi({ branding: { background: 'transparent' } })
    ui.setup?.(context)

    expect(context.staticConfig.ui).toEqual({
      branding: { background: 'transparent' },
    })
    expect(ui.assets).toBeUndefined()
  })

  it('publishes color-scheme viewer backgrounds with the branding', () => {
    expect.assertions(1)

    const context = createContext()
    const background = {
      light: 'linear-gradient(white, transparent)',
      dark: 'linear-gradient(#111, transparent)',
    }
    const ui = createUi({ branding: { background } })
    ui.setup?.(context)

    expect(context.staticConfig.ui).toEqual({ branding: { background } })
  })

  it('publishes standalone and iframe viewer backgrounds with the branding', () => {
    expect.assertions(1)

    const background = {
      standalone: { light: '#fff', dark: '#282828' },
      iframe: 'transparent',
    }
    const ui = createUi({ branding: { background } })
    const context = createContext()
    ui.setup?.(context)
    expect(context.staticConfig.ui).toEqual({ branding: { background } })
  })

  it('disables the standalone viewer', () => {
    expect.assertions(1)

    const ui = createUi({ viewer: false })

    expect(ui.viewer).toBeUndefined()
  })
})
