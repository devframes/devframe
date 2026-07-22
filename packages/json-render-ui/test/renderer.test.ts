import { describe, expect, it } from 'vitest'
import { ERROR_COMPONENT_TYPE } from '../src/registry'
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
})
