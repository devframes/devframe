/**
 * One-time import of saved queries that earlier Vite DevTools versions kept in
 * a single machine-wide directory.
 *
 * Before the host split its storage scopes, every project on the machine wrote
 * its private queries into `<legacy project dir>/data-inspector/queries.json`,
 * and a record carries no project field. The kit cannot attribute a record to a
 * project, so the import is explicit: the UI lists the records and the user
 * claims the ones that belong to the open project.
 *
 * Claim state lives in a sidecar next to the legacy file, keyed by record id
 * and carrying the claiming project, so the next project only sees what nobody
 * claimed yet. Claimed and discarded records stay out of every other project:
 * copying them around would publish one project's private queries into another.
 */
import type { DevframeNodeContext } from 'devframe'
import type { LegacyQueriesMode, LegacyQueriesReport, SavedQuery } from './engine/contract'
import { join } from 'node:path'
import { createStorage, resolveLegacyStorageDir } from 'devframe/node'
import { importSavedQueries } from './saved-queries'

/** A legacy record: the stored shape, which never had a scope. */
type LegacyRecord = Omit<SavedQuery, 'scope'>

interface LegacyQueriesFile {
  queries: Record<string, LegacyRecord>
}

interface LegacyClaim {
  /** Absolute workspace root of the project that resolved the record. */
  project: string
  at: number
  mode: LegacyQueriesMode
}

interface LegacyClaimsFile {
  claims: Record<string, LegacyClaim>
}

interface LegacyStores {
  queries: ReturnType<typeof createStorage<LegacyQueriesFile>>
  claims: ReturnType<typeof createStorage<LegacyClaimsFile>>
}

// `null` caches "this host has no legacy directory", so the duck-typed lookup
// runs once per context.
const stores = new WeakMap<object, LegacyStores | null>()

function storesFor(ctx: DevframeNodeContext): LegacyStores | null {
  const cached = stores.get(ctx)
  if (cached !== undefined)
    return cached
  const legacyDir = resolveLegacyStorageDir(ctx.host, 'project')
  let created: LegacyStores | null = null
  if (legacyDir) {
    const dir = join(legacyDir, 'data-inspector')
    created = {
      // Only ever read: devframe must not rewrite another tool's file.
      queries: createStorage<LegacyQueriesFile>({
        filepath: join(dir, 'queries.json'),
        initialValue: { queries: {} },
      }),
      claims: createStorage<LegacyClaimsFile>({
        filepath: join(dir, 'queries.claims.json'),
        initialValue: { claims: {} },
      }),
    }
  }
  stores.set(ctx, created)
  return created
}

function recordsOf(stores: LegacyStores): LegacyRecord[] {
  return Object.values(stores.queries.value().queries ?? {})
}

/**
 * The legacy records nobody has claimed yet, newest first. `total` is how many
 * the file holds, so a caller can tell "everything claimed" from "no file".
 */
export function listLegacyQueries(ctx: DevframeNodeContext): LegacyQueriesReport {
  const legacy = storesFor(ctx)
  if (!legacy)
    return { records: [], total: 0 }
  const claims = legacy.claims.value().claims ?? {}
  const records = recordsOf(legacy)
  return {
    records: records
      .filter(record => !claims[record.id])
      .map(record => ({ ...record, scope: 'project' as const }))
      .sort((a, b) => b.updatedAt - a.updatedAt),
    total: records.length,
  }
}

/**
 * Claim the selected records into the current project, or discard them. Both
 * outcomes are recorded as claim state, so no other project is offered the
 * same records again. Returns the remaining unclaimed report.
 */
export function resolveLegacyQueries(
  ctx: DevframeNodeContext,
  ids: readonly string[],
  mode: LegacyQueriesMode,
): LegacyQueriesReport {
  const legacy = storesFor(ctx)
  if (!legacy)
    return { records: [], total: 0 }
  const claims = legacy.claims.value().claims ?? {}
  const wanted = new Set(ids)
  const resolved = recordsOf(legacy).filter(record => wanted.has(record.id) && !claims[record.id])
  if (resolved.length) {
    if (mode === 'claim')
      importSavedQueries(ctx, resolved)
    legacy.claims.mutate((draft) => {
      draft.claims ??= {}
      const at = Date.now()
      for (const record of resolved)
        draft.claims[record.id] = { project: ctx.workspaceRoot, at, mode }
    })
  }
  return listLegacyQueries(ctx)
}
