import type { FilterOptions, QueryStats } from '@devframes/plugin-data-inspector/engine'

/** One successful response and the conditions that produced it. */
export interface QueryObservation {
  source: { id: string, title: string }
  query: string
  filters: Required<FilterOptions>
  receivedAt: number
  result: unknown
  normalize: QueryStats['normalize']
}

function fenced(text: string, language = ''): string {
  const runs = text.match(/`+/g) ?? []
  const fence = '`'.repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), 3))
  return `${fence}${language}\n${text}\n${fence}`
}

export function observationMarkdown(observation: QueryObservation, notices: string[]): string {
  const { source, query, filters, receivedAt, result, normalize } = observation
  return [
    '# Data Inspector query result',
    '## Source and time',
    fenced(`Name: ${source.title}\nID: ${source.id}`),
    `Browser received this result at ${new Date(receivedAt).toISOString()} (UTC). This is not the time when the data was sampled on the node side.`,
    ...notices,
    '## Executed query',
    fenced(query, 'jora'),
    'Filters:',
    ...Object.entries(filters).map(([key, value]) => `- ${key}: ${value}`),
    '## Result',
    fenced(JSON.stringify(result, null, 2) ?? 'null', 'json'),
    '## Data scope and limits',
    'This is one successful response after Data Inspector conversion and filtering, not a lossless copy of the original object.',
    `Reported truncation: depth=${normalize.truncatedDepth}, entries=${normalize.truncatedEntries}, properties=${normalize.truncatedProps}.`,
    'No reported truncation does not prove completeness. Later node expansions are not included. The source name and ID do not identify a machine or deployment.',
  ].join('\n\n')
}
