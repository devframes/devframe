import { describe, expect, it, vi } from 'vitest'
import { ERROR_COMPONENT_TYPE, UNSUPPORTED_COMPONENT_TYPE } from '../src/registry'
import { sanitizeSpec } from '../src/renderer'

describe('sanitizeSpec (render-time validation)', () => {
  it('leaves a valid spec unchanged', () => {
    const spec = {
      root: 'a',
      elements: { a: { type: 'Button', props: { label: 'Go', variant: 'primary' }, children: [] } },
    }
    expect(sanitizeSpec(spec)).toBe(spec)
  })

  it('isolates an element with invalid props behind the error component', () => {
    const spec = {
      root: 'a',
      elements: {
        a: { type: 'Button', props: { variant: 'nope' }, children: [] },
        b: { type: 'Text', props: { text: 'ok' }, children: [] },
      },
    }
    const result = sanitizeSpec(spec)
    expect(result).not.toBe(spec)
    expect(result.elements.a.type).toBe(ERROR_COMPONENT_TYPE)
    expect(result.elements.b.type).toBe('Text')
  })

  it('placeholders an unsupported component and keeps the rest of the view', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const spec = {
      root: 'root',
      elements: {
        root: { type: 'Stack', props: {}, children: ['a', 'b'] },
        a: { type: 'Fancy3DChart', props: { data: [1, 2], title: 'x' }, children: [] },
        b: { type: 'Text', props: { text: 'ok' }, children: [] },
      },
    }
    const result = sanitizeSpec(spec)
    expect(result).not.toBe(spec)
    expect(result.elements.a.type).toBe(UNSUPPORTED_COMPONENT_TYPE)
    // Carries the original type + a gist of the element's prop keys.
    expect(result.elements.a.props).toEqual({ type: 'Fancy3DChart', keys: ['data', 'title'] })
    expect(result.elements.b.type).toBe('Text')
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('respects a subset registry — a base component absent from it is unsupported', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const spec = {
      root: 'a',
      elements: { a: { type: 'Button', props: { label: 'Go' }, children: [] } },
    }
    // A registry that supports neither Button nor the reserved placeholders
    // except the unsupported one, so Button resolves to the placeholder.
    const registry = { [UNSUPPORTED_COMPONENT_TYPE]: () => null } as any
    const result = sanitizeSpec(spec, registry)
    expect(result.elements.a.type).toBe(UNSUPPORTED_COMPONENT_TYPE)
    expect(result.elements.a.props).toEqual({ type: 'Button', keys: ['label'] })
    warn.mockRestore()
  })
})
