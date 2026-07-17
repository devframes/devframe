import type { DataSourceEntry } from '../registry/index'
import process from 'node:process'

/** Id of the built-in example source (namespaced like every source id). */
export const EXAMPLE_SOURCE_ID = 'devframes:plugin:data-inspector:example'

class RequestLog {
  readonly startedAt = new Date()
  private secret = 'own-fields-are-visible'
  entries = new Map<string, { path: string, hits: number }>([
    ['home', { path: '/', hits: 41 }],
    ['docs', { path: '/docs', hits: 7 }],
    ['api', { path: '/api/data', hits: 23 }],
  ])
}

function createExampleData(): Record<string, unknown> {
  const log = new RequestLog()
  const node: Record<string, unknown> = { name: 'root' }
  node.self = node // circular structures render as $ref markers

  const data: Record<string, unknown> = {
    server: {
      name: 'example',
      port: 5173,
      tags: new Set(['dev', 'local', 'example']),
      middlewares: [
        { name: 'compression', handler: () => {} },
        { name: 'static', handler: () => {} },
      ],
    },
    requests: log,
    build: {
      hash: 'c3f7c4e',
      size: 1024n * 512n,
      modules: Array.from({ length: 300 }, (_, i) => ({
        id: `src/module-${i}.ts`,
        imports: i % 7,
        sizeKb: Math.round(Math.sin(i) * 40 + 50),
      })),
    },
    tree: node,
    process: { pid: process.pid, node: process.version, platform: process.platform },
  }
  // An own getter: reads at query time, so re-running shows the data is live.
  Object.defineProperty(data, 'queriedAt', {
    enumerable: true,
    get: () => new Date().toISOString(),
  })
  return data
}

/**
 * The built-in example source — a small live graph exercising everything the
 * viewer can show (Maps, Sets, class instances, circulars, BigInt, functions,
 * a query-time getter), with suggested queries as starting points. Sources
 * registered by your plugins and hosts appear next to it; disable it via
 * `createDataInspectorDevframe({ exampleSource: false })`.
 */
export function createExampleDataSource(): DataSourceEntry {
  let data: Record<string, unknown> | undefined
  return {
    id: EXAMPLE_SOURCE_ID,
    title: 'Example data',
    description: 'A built-in playground graph. Register your own sources to inspect real objects.',
    icon: 'i-ph:flask-duotone',
    data: () => data ??= createExampleData(),
    queries: [
      {
        title: 'Busiest endpoints',
        description: 'Live Map entries, sorted',
        query: 'requests.entries.mapEntries().value.sort(hits desc)',
      },
      {
        title: 'Large modules as a table',
        description: 'Filter and project an array',
        query: 'build.modules.[sizeKb > 80].({ id, sizeKb })',
      },
      {
        title: 'Server config (data only)',
        description: 'Filters strip the middleware functions',
        query: 'server',
        excludeFunctions: true,
      },
      { title: 'Everything', query: '' },
    ],
  }
}
