/**
 * PROTOTYPE — throwaway code.
 *
 * Saved-query persistence, id-keyed, in two scopes:
 *   - `user`    -> `<workspaceRoot>/node_modules/.data-inspector/queries.json`
 *                  (per-checkout, invisible to git)
 *   - `project` -> `<workspaceRoot>/.devframe/data-inspector/queries.json`
 *                  (committable, shared with the team)
 *
 * Backed by devframe's `createStorage` (debounced atomic JSON writes).
 */
import type { DevframeNodeContext } from 'devframe/types'
import type { SavedQuery, SavedQueryScope, SaveQueryInput } from './rpc-contract'
import { join } from 'node:path'
import { createStorage } from 'devframe/node'

interface QueriesFile {
  queries: Record<string, Omit<SavedQuery, 'scope'>>
}

type Store = ReturnType<typeof createStorage<QueriesFile>>

const stores = new WeakMap<object, Record<SavedQueryScope, Store>>()

const SCOPE_PATHS: Record<SavedQueryScope, string> = {
  user: 'node_modules/.data-inspector/queries.json',
  project: '.devframe/data-inspector/queries.json',
}

function storesFor(ctx: DevframeNodeContext): Record<SavedQueryScope, Store> {
  let byScope = stores.get(ctx)
  if (!byScope) {
    byScope = {
      user: createStorage<QueriesFile>({
        filepath: join(ctx.workspaceRoot, SCOPE_PATHS.user),
        initialValue: { queries: {} },
      }),
      project: createStorage<QueriesFile>({
        filepath: join(ctx.workspaceRoot, SCOPE_PATHS.project),
        initialValue: { queries: {} },
      }),
    }
    stores.set(ctx, byScope)
  }
  return byScope
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `query-${Date.now()}`
}

export function listSavedQueries(ctx: DevframeNodeContext): SavedQuery[] {
  const byScope = storesFor(ctx)
  const out: SavedQuery[] = []
  for (const scope of ['project', 'user'] as const) {
    for (const entry of Object.values(byScope[scope].value().queries))
      out.push({ ...entry, scope })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveQuery(ctx: DevframeNodeContext, input: SaveQueryInput): SavedQuery {
  const byScope = storesFor(ctx)
  const id = input.id ?? slugify(input.title)
  const record: Omit<SavedQuery, 'scope'> = {
    id,
    title: input.title,
    description: input.description || undefined,
    query: input.query,
    sourceId: input.sourceId,
    updatedAt: Date.now(),
  }
  byScope[input.scope].mutate((draft) => {
    draft.queries[id] = record
  })
  // The id is the storage key across both scopes — saving into one scope
  // moves the query there rather than leaving a stale twin behind.
  const other: SavedQueryScope = input.scope === 'user' ? 'project' : 'user'
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
