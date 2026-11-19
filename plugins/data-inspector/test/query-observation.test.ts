import type { QueryObservation } from '../app/composables/query-observation'
import { describe, expect, it } from 'vitest'
import { observationMarkdown } from '../app/composables/query-observation'

function observation(): QueryObservation {
  return {
    source: { id: 'tasks', title: 'Task queue' },
    query: '$',
    filters: { excludeFunctions: false, excludeUnderscoreProps: true, excludeDollarProps: false },
    receivedAt: Date.UTC(2026, 10, 5, 12),
    result: [],
    normalize: {
      nodes: 1,
      refs: 0,
      truncatedDepth: 0,
      truncatedEntries: 0,
      truncatedProps: 0,
      ms: 1,
    },
  }
}

describe('query observation Markdown', () => {
  it('copies large results with many backtick runs without dropping content', () => {
    const saved = observation()
    saved.result = Array.from({ length: 200 }, () => '`a'.repeat(2000))
    expect(observationMarkdown(saved, [])).toContain(JSON.stringify(saved.result, null, 2))
  })

  it('includes the successful empty result, explicit filters, receipt time and limits', () => {
    const text = observationMarkdown(observation(), ['A new query is pending. This is the previous successful result.'])
    expect(text).toContain('Name: Task queue\nID: tasks')
    expect(text).toContain('2026-11-05T12:00:00.000Z (UTC)')
    expect(text).toContain('excludeFunctions: false')
    expect(text).toContain('excludeUnderscoreProps: true')
    expect(text).toContain('excludeDollarProps: false')
    expect(text).toContain('```json\n[]\n```')
    expect(text).toContain('A new query is pending.')
    expect(text).toContain('No reported truncation does not prove completeness.')
    expect(text).not.toContain('queryMs')
  })

  it('reports all truncation counters and preserves arbitrary fenced content', () => {
    const saved = observation()
    saved.source.title = 'Queue\n```\n# arbitrary title'
    saved.query = '"````"'
    saved.result = { value: '`````\ntext' }
    saved.normalize.truncatedProps = 5
    const text = observationMarkdown(saved, [])
    expect(text).toContain('````\nName: Queue\n```\n# arbitrary title\nID: tasks\n````')
    expect(text).toContain('`````jora\n"````"\n`````')
    expect(text).toContain('``````json\n')
    expect(text).toContain('depth=0, entries=0, properties=5')
    expect(text).toContain(JSON.stringify(saved.result, null, 2))
  })
})
