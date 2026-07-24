import type { Violation } from '../../shared/protocol.ts'

/** One selected violation, with the route context it was found on. */
export interface SelectedItem {
  route: string
  url: string
  violation: Violation
}

/**
 * Build a single, paste-ready AI prompt that gathers the full context needed to
 * fix the selected violations: rule metadata, WCAG tags, docs, and every
 * offending element's selector, markup, and axe failure summary — grouped by
 * the route they were found on.
 */
export function buildFixPrompt(items: SelectedItem[]): string {
  const lines: string[] = [
    'You are an accessibility engineer. Fix the following WCAG issues found by axe-core.',
    'For each violation, change the markup and/or styles so the rule passes while preserving the design and behavior, and briefly explain each fix.',
    '',
  ]

  const byRoute = new Map<string, SelectedItem[]>()
  for (const item of items) {
    const bucket = byRoute.get(item.route) ?? []
    bucket.push(item)
    byRoute.set(item.route, bucket)
  }

  for (const [route, bucket] of byRoute) {
    const url = bucket[0]?.url
    lines.push(`## Route: ${route}${url ? ` (${url})` : ''}`)
    for (const { violation: v } of bucket) {
      lines.push('')
      lines.push(`### ${v.ruleId} — ${v.help}`)
      lines.push(`- Impact: ${v.impact}${v.bestPractice ? ' (best practice)' : ''}`)
      if (v.tags?.length)
        lines.push(`- WCAG: ${v.tags.join(', ')}`)
      lines.push(`- Docs: ${v.helpUrl}`)
      lines.push(`- What it checks: ${v.description}`)
      lines.push(`- Affected element${v.nodes.length === 1 ? '' : 's'} (${v.nodes.length}):`)
      for (const node of v.nodes) {
        lines.push(`  - selector: \`${node.target.join(' ')}\``)
        lines.push('    ```html')
        lines.push(`    ${node.html}`)
        lines.push('    ```')
        if (node.failureSummary)
          lines.push(`    fix hint: ${node.failureSummary.replace(/\s*\n\s*/g, ' ')}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}
