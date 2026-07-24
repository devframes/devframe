import type { ScanReport } from '../src/shared/protocol.ts'
import { describe, expect, it } from 'vitest'
import { createGetConfig } from '../src/rpc/functions/get-config.ts'
import { DEFAULT_AXE_TAGS, emptyCounts, sumCounts } from '../src/shared/protocol.ts'

function report(counts: Partial<ReturnType<typeof emptyCounts>>, route = '/'): ScanReport {
  return {
    route,
    url: `https://example.test${route}`,
    scannedAt: 1,
    engine: 'axe-test',
    violations: [],
    counts: { ...emptyCounts(), ...counts },
  }
}

describe('sumCounts', () => {
  it('rolls per-impact counts across many route reports', () => {
    const total = sumCounts([
      report({ critical: 2, minor: 1 }, '/'),
      report({ critical: 1, serious: 3 }, '/about'),
    ])
    expect(total).toEqual({ critical: 3, serious: 3, moderate: 0, minor: 1 })
  })

  it('returns an empty counter for no reports', () => {
    expect(sumCounts([])).toEqual(emptyCounts())
  })
})

describe('createGetConfig', () => {
  it('defaults auto-scan + logging on, best-practice tags in, default-highlight off', () => {
    const cfg = createGetConfig().handler!() as any
    expect(cfg.dockId).toBe('devframes_plugin_a11y')
    expect(cfg.defaultHighlight).toBe(false)
    expect(cfg.agent.autoScan).toBe(true)
    expect(cfg.agent.logIssues).toBe(true)
    expect(cfg.agent.activateDockId).toBe('devframes_plugin_a11y')
    // Broadened default tag set includes WCAG 2.2 + best-practice.
    expect([...DEFAULT_AXE_TAGS]).toContain('best-practice')
    expect([...DEFAULT_AXE_TAGS]).toContain('wcag22aa')
  })

  it('threads author options through to the agent config and dock id', () => {
    const cfg = createGetConfig({
      dockId: 'my_a11y',
      autoScan: false,
      logIssues: false,
      defaultHighlight: true,
      axe: { tags: ['wcag2a'], runOptions: { iframes: true } },
    }).handler!() as any
    expect(cfg.dockId).toBe('my_a11y')
    expect(cfg.defaultHighlight).toBe(true)
    expect(cfg.agent).toMatchObject({
      autoScan: false,
      logIssues: false,
      axeTags: ['wcag2a'],
      axeRunOptions: { iframes: true },
      activateDockId: 'my_a11y',
    })
  })
})
