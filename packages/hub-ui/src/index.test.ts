import type { DevframeHubContext } from '@devframes/hub/node'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createUi } from './index'

function createContext(): DevframeHubContext {
  return { staticConfig: {} } as unknown as DevframeHubContext
}

describe('createUi branding background', () => {
  it('defines the viewer background through a static token', () => {
    expect.assertions(5)

    const html = readFileSync(join(import.meta.dirname, '..', 'dist', 'client', 'standalone', 'index.html'), 'utf8')

    expect(html).not.toContain('__hub-ui.css')
    expect(html).toContain('html.viewer-background-transparent')
    expect(html).toContain('--devframes-viewer-background: transparent')
    expect(html).toContain('background: var(--devframes-viewer-background)')
    expect(html).toMatch(/html\.viewer-background-transparent\s*\{[^}]*color-scheme:\s*normal/)
  })

  it('preserves the default viewer background', () => {
    expect.assertions(2)

    const context = createContext()
    const ui = createUi()
    ui.setup?.(context)

    expect(context.staticConfig.ui).toEqual({ branding: {} })
    expect(ui.assets).toBeUndefined()
  })

  it('publishes a transparent viewer background with the branding', () => {
    expect.assertions(2)

    const context = createContext()
    const ui = createUi({ branding: { background: 'transparent' } })
    ui.setup?.(context)

    expect(context.staticConfig.ui).toEqual({
      branding: { background: 'transparent' },
    })
    expect(ui.assets).toBeUndefined()
  })

  it('disables the standalone viewer', () => {
    expect.assertions(1)

    const ui = createUi({ viewer: false })

    expect(ui.viewer).toBeUndefined()
  })
})
