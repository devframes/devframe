import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyPanelBranding } from '../design/panel-theme'

const setup = vi.hoisted(() => vi.fn())
vi.mock('devframe/client', () => ({ setupDevframeConnection: setup }))

let values: Map<string, string>
let cleanup: (() => void) | undefined

beforeEach(() => {
  values = new Map()
  setup.mockReset()
  vi.stubGlobal('window', { parent: {} })
  vi.stubGlobal('CSS', { supports: (_: string, color: string) => color === '#6b84fd' })
  vi.stubGlobal('document', {
    documentElement: {
      style: {
        getPropertyValue: (name: string) => values.get(name) ?? '',
        getPropertyPriority: () => '',
        setProperty: (name: string, value: string) => values.set(name, value),
        removeProperty: (name: string) => values.delete(name),
      },
    },
  })
})

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.unstubAllGlobals()
})

it('keeps standalone SPAs independent of hub branding', () => {
  window.parent = window
  cleanup = applyPanelBranding()
  expect(setup).not.toHaveBeenCalled()
  expect(values.size).toBe(0)
})

it('maps startup metadata to one CSS input and restores the previous palette on cleanup', async () => {
  values.set('--devframe-primary', 'red')
  setup.mockResolvedValue({ connectionMeta: { configs: { ui: { branding: { primaryColor: '#6b84fd' } } } } })
  cleanup = applyPanelBranding()
  await vi.waitFor(() => expect(values.get('--devframe-primary')).toBe('#6b84fd'))
  expect([...values.keys()]).toEqual(['--devframe-primary'])
  cleanup()
  expect(values.get('--devframe-primary')).toBe('red')
})

it.each([undefined, '', 'invalid-color'])('keeps the default palette for missing or invalid branding (%s)', async (primaryColor) => {
  setup.mockResolvedValue({ connectionMeta: { configs: { ui: { branding: { primaryColor } } } } })
  cleanup = applyPanelBranding()
  await setup.mock.results[0].value
  expect(values.size).toBe(0)
})

it('keeps the default palette when connection metadata is unavailable', async () => {
  setup.mockRejectedValue(new Error('Unavailable'))
  cleanup = applyPanelBranding()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(values.size).toBe(0)
})

it('ignores metadata that arrives after the SPA has been disposed', async () => {
  let resolve!: (value: unknown) => void
  setup.mockReturnValue(new Promise((done) => {
    resolve = done
  }))
  cleanup = applyPanelBranding()
  cleanup()
  resolve({ connectionMeta: { configs: { ui: { branding: { primaryColor: '#6b84fd' } } } } })
  await setup.mock.results[0].value
  expect(values.size).toBe(0)
})
