import type { HubMessageInput } from '../src/inject/messages.ts'
import type { ScanReport, Violation } from '../src/shared/protocol.ts'
import { describe, expect, it } from 'vitest'
import { createMessagesReporter } from '../src/inject/messages.ts'
import { emptyCounts } from '../src/shared/protocol.ts'

function createStubMessages() {
  const added: HubMessageInput[] = []
  const removed: string[] = []
  return {
    added,
    removed,
    client: {
      add: async (input: HubMessageInput) => {
        added.push(input)
      },
      remove: async (id: string) => {
        removed.push(id)
      },
    },
  }
}

function violation(ruleId: string, impact: Violation['impact'], nodes = 1): Violation {
  return {
    ruleId,
    impact,
    help: `Fix ${ruleId}`,
    description: `Ensures ${ruleId}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/${ruleId}`,
    tags: ['wcag2a'],
    nodes: Array.from({ length: nodes }, (_, i) => ({
      id: `${ruleId}-${i}`,
      target: [`#${ruleId}-${i}`],
      html: `<div id="${ruleId}-${i}">`,
      failureSummary: `Fix the ${ruleId} element`,
    })),
  }
}

function report(violations: Violation[]): ScanReport {
  return {
    url: 'https://example.test/',
    scannedAt: 1,
    engine: 'axe-test',
    violations,
    counts: emptyCounts(),
  }
}

describe('createMessagesReporter', () => {
  it('drives the summary entry through the loading → idle lifecycle', () => {
    const { client, added } = createStubMessages()
    const reporter = createMessagesReporter(client)

    reporter.scanning()
    expect(added.at(-1)).toMatchObject({
      id: 'devframe-a11y-inspector:scan',
      level: 'info',
      status: 'loading',
    })

    reporter.report(report([]))
    expect(added.at(-1)).toMatchObject({
      id: 'devframe-a11y-inspector:scan',
      message: 'No accessibility issues found',
      level: 'success',
      status: 'idle',
    })
  })

  it('emits one entry per violated rule with impact-mapped level, WCAG labels, and element position', () => {
    const { client, added } = createStubMessages()
    const reporter = createMessagesReporter(client)

    reporter.report(report([violation('image-alt', 'critical', 2), violation('label', 'moderate')]))

    const summary = added.find(m => m.id === 'devframe-a11y-inspector:scan')
    expect(summary).toMatchObject({
      message: '3 accessibility issues across 2 rules',
      level: 'warn',
    })

    const imageAlt = added.find(m => m.id === 'devframe-a11y-inspector:rule:image-alt')
    expect(imageAlt).toMatchObject({
      message: 'Fix image-alt (2)',
      level: 'error',
      labels: ['critical', 'wcag2a'],
      elementPosition: { selector: '#image-alt-0', description: 'Fix the image-alt element' },
    })
    expect(added.find(m => m.id === 'devframe-a11y-inspector:rule:label')).toMatchObject({
      level: 'warn',
      labels: ['moderate', 'wcag2a'],
    })
  })

  it('removes entries for rules that no longer violate on re-scan', () => {
    const { client, added, removed } = createStubMessages()
    const reporter = createMessagesReporter(client)

    reporter.report(report([violation('image-alt', 'critical'), violation('label', 'minor')]))
    reporter.report(report([violation('label', 'minor')]))

    expect(removed).toEqual(['devframe-a11y-inspector:rule:image-alt'])
    // The surviving rule was re-added (dedup by stable id updates in place).
    expect(added.filter(m => m.id === 'devframe-a11y-inspector:rule:label')).toHaveLength(2)
  })

  it('settles the summary entry as an error when a scan fails', () => {
    const { client, added } = createStubMessages()
    const reporter = createMessagesReporter(client)

    reporter.failed(new Error('axe exploded'))
    expect(added.at(-1)).toMatchObject({
      id: 'devframe-a11y-inspector:scan',
      message: 'Accessibility scan failed',
      description: 'Error: axe exploded',
      level: 'error',
      status: 'idle',
    })
  })

  it('never lets a rejected feed call escape the scan loop', () => {
    const reporter = createMessagesReporter({
      add: async () => {
        throw new Error('not trusted')
      },
      remove: async () => {
        throw new Error('not trusted')
      },
    })
    expect(() => {
      reporter.scanning()
      reporter.report(report([violation('image-alt', 'critical')]))
      reporter.report(report([]))
      reporter.failed(new Error('boom'))
    }).not.toThrow()
  })
})
