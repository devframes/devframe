import type { DevframeHubContext } from '@devframes/hub/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createUi } from './index'

function createContext(): DevframeHubContext {
  return { staticConfig: {} } as unknown as DevframeHubContext
}

describe('createUi branding background', () => {
  it('defines the viewer background through a static token', () => {
    expect.assertions(6)

    const html = readFileSync(fileURLToPath(new URL('../dist/client/standalone/index.html', import.meta.url)), 'utf8')

    expect(html).not.toContain('__hub-ui.css')
    expect(html).toContain('html.viewer-background-custom')
    expect(html).toContain('--devframes-viewer-background: #fff')
    expect(html).toContain('--devframes-viewer-background: #111')
    expect(html).toContain('background: var(--devframes-viewer-background)')
    expect(html).toMatch(/html\.viewer-background-custom\s*\{[^}]*color-scheme:\s*normal/)
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

  it('disables the standalone viewer', () => {
    expect.assertions(1)

    const ui = createUi({ viewer: false })

    expect(ui.viewer).toBeUndefined()
  })
})
