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

function report(violations: Violation[], route = '/'): ScanReport {
  return {
    route,
    url: `https://example.test${route}`,
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
      id: 'devframes:plugin:a11y:scan',
      level: 'info',
      status: 'loading',
    })

    reporter.report(report([]))
    expect(added.at(-1)).toMatchObject({
      id: 'devframes:plugin:a11y:scan',
      message: 'No accessibility issues found',
      level: 'success',
      category: 'a11y',
      status: 'idle',
    })
  })

  it('emits one entry per violated rule with impact-mapped level, WCAG labels, and element position', () => {
    const { client, added } = createStubMessages()
    const reporter = createMessagesReporter(client, {
      resolveBoundingBox: target =>
        target[0] === '#image-alt-0' ? { x: 1, y: 2, width: 30, height: 40 } : undefined,
    })

    reporter.report(report([violation('image-alt', 'critical', 2), violation('label', 'moderate')]))

    const summary = added.find(m => m.id === 'devframes:plugin:a11y:scan')
    expect(summary).toMatchObject({
      message: '3 accessibility issues across 2 rules',
      level: 'warn',
    })

    const imageAlt = added.find(m => m.id === 'devframes:plugin:a11y:rule:image-alt')
    expect(imageAlt).toMatchObject({
      message: 'Fix image-alt (2)',
      level: 'error',
      category: 'a11y',
      labels: ['critical', 'wcag2a'],
      elementPosition: {
        selector: '#image-alt-0',
        boundingBox: { x: 1, y: 2, width: 30, height: 40 },
        description: 'Fix the image-alt element',
      },
    })
    expect(added.find(m => m.id === 'devframes:plugin:a11y:rule:label')).toMatchObject({
      level: 'warn',
      labels: ['moderate', 'wcag2a'],
    })
    // No resolver hit — the box is simply absent, never a throw.
    expect(added.find(m => m.id === 'devframes:plugin:a11y:rule:label')?.elementPosition?.boundingBox)
      .toBeUndefined()
  })

  it('carries dock-navigation actions deep-linked to the rule + route, and the summary to the dashboard', () => {
    const { client, added } = createStubMessages()
    const reporter = createMessagesReporter(client, { dockId: () => 'custom_a11y' })

    reporter.report(report([violation('image-alt', 'critical')], '/about'))

    const summary = added.find(m => m.id === 'devframes:plugin:a11y:scan')
    expect(summary?.actions).toEqual([{
      id: 'dashboard',
      label: 'Open a11y dashboard',
      kind: 'activate',
      activate: { dockId: 'custom_a11y', params: { tab: 'dashboard' } },
    }])

    const rule = added.find(m => m.id === 'devframes:plugin:a11y:rule:image-alt')
    expect(rule?.actions).toEqual([{
      id: 'view',
      label: 'View in a11y inspector',
      kind: 'activate',
      activate: { dockId: 'custom_a11y', params: { tab: 'violations', ruleId: 'image-alt', route: '/about' } },
    }])
  })

  it('falls back to the default dock id when none is configured', () => {
    const { client, added } = createStubMessages()
    const reporter = createMessagesReporter(client)

    reporter.report(report([violation('image-alt', 'critical')]))
    const rule = added.find(m => m.id === 'devframes:plugin:a11y:rule:image-alt')
    expect(rule?.actions?.[0]?.activate.dockId).toBe('devframes_plugin_a11y')
  })

  it('removes entries for rules that no longer violate on re-scan', () => {
    const { client, added, removed } = createStubMessages()
    const reporter = createMessagesReporter(client)

    reporter.report(report([violation('image-alt', 'critical'), violation('label', 'minor')]))
    reporter.report(report([violation('label', 'minor')]))

    expect(removed).toEqual(['devframes:plugin:a11y:rule:image-alt'])
    // The surviving rule was re-added (dedup by stable id updates in place).
    expect(added.filter(m => m.id === 'devframes:plugin:a11y:rule:label')).toHaveLength(2)
  })

  it('settles the summary entry as an error when a scan fails', () => {
    const { client, added } = createStubMessages()
    const reporter = createMessagesReporter(client)

    reporter.failed(new Error('axe exploded'))
    expect(added.at(-1)).toMatchObject({
      id: 'devframes:plugin:a11y:scan',
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
