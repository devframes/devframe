/**
 * Saved-query persistence, id-keyed, in two scopes mapped onto the host
 * storage classes:
 *
 *   - `workspace` -> `getStorageDir('workspace')/data-inspector/queries.json`
 *                    (committable, shared with the team)
 *   - `project`   -> `getStorageDir('project')/data-inspector/queries.json`
 *                    (per-checkout private, under node_modules)
 *
 * A saved query is a source-agnostic recipe: the query text, optional
 * title/description, and the FilterOptions it was authored with. Backed by
 * devframe's `createStorage` (debounced atomic JSON writes).
 */
import type { DevframeNodeContext } from 'devframe/types'
import type { SavedQuery, SavedQueryScope, SaveQueryInput } from '../engine/contract'
import { join } from 'node:path'
import { createStorage } from 'devframe/node'

interface QueriesFile {
  queries: Record<string, Omit<SavedQuery, 'scope'>>
}

type Store = ReturnType<typeof createStorage<QueriesFile>>

const stores = new WeakMap<object, Record<SavedQueryScope, Store>>()

function storesFor(ctx: DevframeNodeContext): Record<SavedQueryScope, Store> {
  let byScope = stores.get(ctx)
  if (!byScope) {
    const open = (scope: SavedQueryScope): Store => createStorage<QueriesFile>({
      filepath: join(ctx.host.getStorageDir(scope), 'data-inspector/queries.json'),
      initialValue: { queries: {} },
    })
    byScope = { workspace: open('workspace'), project: open('project') }
    stores.set(ctx, byScope)
  }
  return byScope
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** djb2 — stable short id for untitled queries (same query, same id). */
function hashOf(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++)
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  return hash.toString(36)
}

function deriveId(input: SaveQueryInput): string {
  if (input.id)
    return input.id
  if (input.title?.trim())
    return slugify(input.title)
  return `q-${hashOf(input.query)}`
}

export function listSavedQueries(ctx: DevframeNodeContext): SavedQuery[] {
  const byScope = storesFor(ctx)
  const out: SavedQuery[] = []
  for (const scope of ['workspace', 'project'] as const) {
    for (const entry of Object.values(byScope[scope].value().queries))
      out.push({ ...entry, scope })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveQuery(ctx: DevframeNodeContext, input: SaveQueryInput): SavedQuery {
  const byScope = storesFor(ctx)
  const id = deriveId(input)
  const record: Omit<SavedQuery, 'scope'> = {
    id,
    query: input.query,
    title: input.title?.trim() || undefined,
    description: input.description?.trim() || undefined,
    excludeFunctions: input.excludeFunctions || undefined,
    excludeUnderscoreProps: input.excludeUnderscoreProps || undefined,
    excludeDollarProps: input.excludeDollarProps || undefined,
    updatedAt: Date.now(),
  }
  byScope[input.scope].mutate((draft) => {
    draft.queries[id] = record
  })
  // The id is the storage key across both scopes — saving into one scope
  // moves the query there rather than leaving a stale twin behind.
  const other: SavedQueryScope = input.scope === 'project' ? 'workspace' : 'project'
  if (byScope[other].value().queries[id]) {
    byScope[other].mutate((draft) => {
      delete draft.queries[id]
    })
  }
  return { ...record, scope: input.scope }
}

export function deleteSavedQuery(ctx: DevframeNodeContext, id: string, scope: SavedQueryScope): boolean {
  const byScope = storesFor(ctx)
  const exists = !!byScope[scope].value().queries[id]
  if (exists) {
    byScope[scope].mutate((draft) => {
      delete draft.queries[id]
    })
  }
  return exists
}
