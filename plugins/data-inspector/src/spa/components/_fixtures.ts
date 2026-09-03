import type { DataSourceMeta, FilterOptions, Query, SavedQuery } from '../../engine'

/**
 * Shared, static sample data so the presentational components render in
 * isolation without a live RPC connection to a server-side data source.
 */
export const sampleSources: DataSourceMeta[] = [
  {
    id: 'devframe',
    title: 'Devframe Context',
    description: 'Runtime context, OS and process info, plus a playground graph.',
    icon: 'i-ph:cube-duotone',
    static: false,
    writable: true,
    queries: [
      { query: 'playground.requests.entries.mapEntries().value.sort(hits desc)', title: 'Top requests' },
      { query: 'playground.build.modules.[sizeKb > 80].({ id, sizeKb })', title: 'Heavy modules' },
    ],
  },
  {
    id: 'build',
    title: 'Build Modules',
    description: 'The production module graph from the last build.',
    icon: 'i-ph:package-duotone',
    static: true,
    writable: false,
  },
]

/** A one-level type skeleton, as the shape panel receives from the backend. */
export const sampleSkeleton: Record<string, unknown> = {
  requests: 'Map(3)',
  middlewares: 'array',
  build: 'object',
  os: 'object',
  uptimeMs: 'number',
  startedAt: 'Date',
}

export const sampleFilters: Required<FilterOptions> = {
  excludeFunctions: true,
  excludeUnderscoreProps: false,
  excludeDollarProps: false,
}

export const sampleSuggested: Query[] = [
  { query: 'playground.requests.size()', title: 'Request count' },
  { query: 'os.({ platform, arch, release })', title: 'OS summary' },
]

export const sampleSaved: SavedQuery[] = [
  {
    id: 'heavy-modules',
    query: 'build.modules.[sizeKb > 80].({ id, sizeKb }).sort(sizeKb desc)',
    title: 'Heavy modules',
    description: 'Modules over 80 kB, largest first.',
    scope: 'project',
    updatedAt: Date.now() - 1000 * 60 * 12,
  },
  {
    id: 'slow-requests',
    query: 'playground.requests.entries.mapEntries().value.[ms > 100]',
    title: 'Slow requests',
    scope: 'workspace',
    updatedAt: Date.now() - 1000 * 60 * 60 * 26,
  },
]
