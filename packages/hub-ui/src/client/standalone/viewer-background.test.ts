import type { ViewerBackgroundElement } from './viewer-background'
import { describe, expect, it, vi } from 'vitest'
import { applyViewerBackground } from './viewer-background'

function createElement(): ViewerBackgroundElement {
  return {
    style: {
      removeProperty: vi.fn(),
      setProperty: vi.fn(),
    },
  }
}

describe('applyViewerBackground', () => {
  it('applies a supported CSS background', () => {
    expect.assertions(3)

    const element = createElement()
    const supports = vi.fn(() => true)

    applyViewerBackground(element, 'linear-gradient(white, transparent)', supports)

    expect(supports).toHaveBeenCalledWith('background', 'linear-gradient(white, transparent)')
    expect(element.style.setProperty).toHaveBeenCalledWith('--devframes-viewer-background', 'linear-gradient(white, transparent)')
    expect(element.style.removeProperty).not.toHaveBeenCalled()
  })

  it.each([undefined, 'not-a-background'])('restores the default for %s', (background) => {
    expect.assertions(2)

    const element = createElement()
    const supports = vi.fn(() => false)

    applyViewerBackground(element, background, supports)

    expect(element.style.removeProperty).toHaveBeenCalledWith('--devframes-viewer-background')
    expect(element.style.setProperty).not.toHaveBeenCalled()
  })
})
