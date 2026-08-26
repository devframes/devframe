import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createUi } from './index'

describe('createUi viewer background', () => {
  it('loads the runtime viewer stylesheet from the production HTML', () => {
    expect.assertions(1)

    const html = readFileSync(join(import.meta.dirname, '..', 'dist', 'client', 'standalone', 'index.html'), 'utf8')

    expect(html).toContain('<link rel="stylesheet" href="./__hub-ui.css" />')
  })

  it('preserves the default viewer background', () => {
    expect.assertions(1)

    const ui = createUi()

    expect(ui.assets?.['__hub-ui.css']()).toBe('')
  })

  it('provides a transparent viewer background when requested', () => {
    expect.assertions(1)

    const ui = createUi({ viewer: { background: 'transparent' } })

    expect(ui.assets?.['__hub-ui.css']()).toBe('html,body{background:transparent!important}')
  })

  it('does not publish viewer assets when the viewer is disabled', () => {
    expect.assertions(2)

    const ui = createUi({ viewer: false })

    expect(ui.viewer).toBeUndefined()
    expect(ui.assets).toBeUndefined()
  })
})
