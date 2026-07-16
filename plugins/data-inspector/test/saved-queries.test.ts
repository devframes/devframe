import type { DevframeNodeContext } from 'devframe/types'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteSavedQuery, listSavedQueries, saveQuery } from '../src/node/saved-queries'

function contextStub(): DevframeNodeContext {
  const root = mkdtempSync(join(tmpdir(), 'di-saved-'))
  return {
    host: {
      getStorageDir: (scope: string) => join(root, scope),
    },
  } as unknown as DevframeNodeContext
}

describe('saved queries', () => {
  it('saves per scope, id-keyed, and lists across scopes', () => {
    const ctx = contextStub()
    saveQuery(ctx, { title: 'Plugin names', query: 'config.plugins.name', scope: 'workspace' })
    saveQuery(ctx, { query: 'keys()', scope: 'project' })
    const all = listSavedQueries(ctx)
    expect(all).toHaveLength(2)
    expect(all.find(q => q.scope === 'workspace')?.id).toBe('plugin-names')
    expect(all.find(q => q.scope === 'project')?.id).toMatch(/^q-/)
  })

  it('derives a stable hash id for untitled queries', () => {
    const ctx = contextStub()
    const first = saveQuery(ctx, { query: 'a.b.c', scope: 'project' })
    const second = saveQuery(ctx, { query: 'a.b.c', scope: 'project' })
    expect(first.id).toBe(second.id)
    expect(listSavedQueries(ctx)).toHaveLength(1)
  })

  it('persists filter options and strips falsy ones', () => {
    const ctx = contextStub()
    const saved = saveQuery(ctx, {
      title: 'clean',
      query: 'config',
      scope: 'workspace',
      excludeFunctions: true,
      excludeUnderscoreProps: false,
    })
    expect(saved.excludeFunctions).toBe(true)
    expect(saved).not.toHaveProperty('excludeUnderscoreProps', false)
  })

  it('re-saving the same id into the other scope moves it', () => {
    const ctx = contextStub()
    saveQuery(ctx, { title: 'One', query: 'a', scope: 'project' })
    saveQuery(ctx, { title: 'One', query: 'a', scope: 'workspace' })
    const all = listSavedQueries(ctx)
    expect(all).toHaveLength(1)
    expect(all[0].scope).toBe('workspace')
  })

  it('deletes by id + scope', () => {
    const ctx = contextStub()
    const saved = saveQuery(ctx, { title: 'One', query: 'a', scope: 'project' })
    expect(deleteSavedQuery(ctx, saved.id, 'project')).toBe(true)
    expect(deleteSavedQuery(ctx, saved.id, 'project')).toBe(false)
    expect(listSavedQueries(ctx)).toHaveLength(0)
  })

  it('writes into <storage>/data-inspector/queries.json per scope', async () => {
    const ctx = contextStub()
    saveQuery(ctx, { title: 'One', query: 'a', scope: 'workspace' })
    // createStorage debounces writes (100ms default).
    await new Promise(resolve => setTimeout(resolve, 250))
    const file = join(ctx.host.getStorageDir('workspace'), 'data-inspector/queries.json')
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    expect(parsed.queries.one.query).toBe('a')
  })
})
