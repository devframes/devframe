import type { ScanReport, Violation, ViolationNode } from '../shared/protocol.ts'
import axe from 'axe-core'
import { A11Y_NODE_ATTR, DEFAULT_AXE_TAGS, emptyCounts, IMPACT_ORDER } from '../shared/protocol.ts'

const IMPACTS = new Set<string>(IMPACT_ORDER)
let counter = 0

/** Coerce axe's nullable, frame-aware impact into our fixed taxonomy. */
function normalizeImpact(value: unknown): Violation['impact'] {
  return typeof value === 'string' && IMPACTS.has(value)
    ? (value as Violation['impact'])
    : 'minor'
}

/**
 * Flatten an axe target into plain selector strings. Top-level nodes yield a
 * single selector; nodes inside frames yield one per frame depth.
 */
function flattenTarget(target: unknown): string[] {
  if (!Array.isArray(target))
    return [String(target)]
  return target.map(entry => (Array.isArray(entry) ? entry.join(' ') : String(entry)))
}

/** Resolve the element a target points at within the top document. */
export function resolveElement(target: string[]): Element | null {
  // The deepest selector is the most specific; try it first, then fall back.
  for (const selector of [...target].reverse()) {
    try {
      const el = document.querySelector(selector)
      if (el)
        return el
    }
    catch {
      // Malformed selector — skip and try the next.
    }
  }
  return null
}

/**
 * Stamp the element with a stable id (reusing one from a prior scan when
 * present) so the panel can re-target it after the DOM shifts.
 */
function stamp(el: Element): string {
  const existing = el.getAttribute(A11Y_NODE_ATTR)
  if (existing)
    return existing
  const id = `a${(counter++).toString(36)}`
  el.setAttribute(A11Y_NODE_ATTR, id)
  return id
}

export interface ScanOptions {
  /** axe rule tags to run (defaults to {@link DEFAULT_AXE_TAGS}). */
  tags?: string[]
  /** Extra axe `run` options merged over the defaults. */
  runOptions?: Record<string, unknown>
}

/**
 * Run axe against the live document and shape the result into a {@link ScanReport}.
 * Stamps each violating element with {@link A11Y_NODE_ATTR} as a side effect.
 */
export async function scan(options: ScanOptions = {}): Promise<ScanReport> {
  const tags = options.tags?.length ? options.tags : [...DEFAULT_AXE_TAGS]
  const results = await axe.run(document, {
    resultTypes: ['violations'],
    // Broadened past strict WCAG A/AA to WCAG 2.2 + best-practice; the panel
    // tags best-practice rules and can filter them back out.
    runOnly: { type: 'tag', values: tags },
    // Stay in the host document — don't descend into the devtools panel's own
    // iframe (or any other frame), which would mix unrelated nodes into the
    // report and risk scanning ourselves.
    iframes: false,
    ...options.runOptions,
  })

  const counts = emptyCounts()
  const violations: Violation[] = results.violations.map((rule) => {
    const impact = normalizeImpact(rule.impact)
    const nodes: ViolationNode[] = rule.nodes.map((node) => {
      const target = flattenTarget(node.target)
      const el = resolveElement(target)
      const id = el ? stamp(el) : target.join('|')
      counts[impact] += 1
      return {
        id,
        target,
        html: node.html.trim().slice(0, 400),
        failureSummary: (node.failureSummary ?? '').trim(),
      }
    })
    return {
      ruleId: rule.id,
      impact,
      help: rule.help,
      description: rule.description,
      helpUrl: rule.helpUrl,
      tags: rule.tags.filter(tag => tag.startsWith('wcag')),
      bestPractice: rule.tags.includes('best-practice'),
      nodes,
    }
  })

  // Surface the most severe rules first.
  violations.sort((a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact))

  return {
    route: location.pathname,
    url: location.href,
    scannedAt: Date.now(),
    engine: results.testEngine?.version ?? 'unknown',
    violations,
    counts,
  }
}
