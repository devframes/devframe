import type { Violation } from '../src/shared/protocol.ts'
import type { SelectedItem } from '../src/spa/lib/fix-prompt.ts'
import { describe, expect, it } from 'vitest'
import { buildFixPrompt } from '../src/spa/lib/fix-prompt.ts'

function violation(ruleId: string, over: Partial<Violation> = {}): Violation {
  return {
    ruleId,
    impact: 'critical',
    help: `Fix ${ruleId}`,
    description: `Ensures ${ruleId}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/${ruleId}`,
    tags: ['wcag2a', 'wcag111'],
    nodes: [{
      id: `${ruleId}-0`,
      target: [`#${ruleId}`],
      html: `<img id="${ruleId}">`,
      failureSummary: 'Fix any of the following:\n  Element has no alt',
    }],
    ...over,
  }
}

const items: SelectedItem[] = [
  { route: '/', url: 'https://example.test/', violation: violation('image-alt') },
  { route: '/forms', url: 'https://example.test/forms', violation: violation('label', { impact: 'serious', bestPractice: true }) },
]

describe('buildFixPrompt', () => {
  it('includes an instruction preamble and groups violations by route', () => {
    const out = buildFixPrompt(items)
    expect(out).toContain('You are an accessibility engineer')
    expect(out).toContain('## Route: / (https://example.test/)')
    expect(out).toContain('## Route: /forms (https://example.test/forms)')
  })

  it('carries the full fixing context: rule, impact, WCAG tags, docs, selector, markup, and hint', () => {
    const out = buildFixPrompt(items)
    expect(out).toContain('### image-alt — Fix image-alt')
    expect(out).toContain('- Impact: critical')
    expect(out).toContain('- WCAG: wcag2a, wcag111')
    expect(out).toContain('- Docs: https://dequeuniversity.com/rules/axe/image-alt')
    expect(out).toContain('selector: `#image-alt`')
    expect(out).toContain('<img id="image-alt">')
    // Failure summary newlines are flattened into a single-line hint.
    expect(out).toContain('fix hint: Fix any of the following: Element has no alt')
  })

  it('marks best-practice rules', () => {
    const out = buildFixPrompt(items)
    expect(out).toContain('- Impact: serious (best practice)')
  })

  it('returns just the preamble when nothing is selected', () => {
    const out = buildFixPrompt([])
    expect(out).toContain('You are an accessibility engineer')
    expect(out).not.toContain('## Route:')
  })
})
