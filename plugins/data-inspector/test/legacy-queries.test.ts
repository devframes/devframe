import type { DevframeNodeContext } from 'devframe'
import type { SavedQuery } from '../src/node/engine/contract'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listLegacyQueries, resolveLegacyQueries } from '../src/node/legacy-queries'
import { listSavedQueries, saveQuery } from '../src/node/saved-queries'

interface Fixture {
  ctx: DevframeNodeContext
  /** Temp base of this machine's storage, shared by two checkouts. */
  root: string
  projectRoot: string
  legacyDir: string
}

/** The stored shape of a legacy record: a saved query before scopes existed. */
type LegacyRecord = Omit<SavedQuery, 'scope'>

/**
 * A context with the three host calls these functions make. `workspaceRoot` is
 * the project identity recorded on a claim, so two fixtures can share one
 * legacy directory and still stand for two checkouts.
 */
function fixture(options: { workspaceRoot?: string, legacy?: boolean, root?: string } = {}): Fixture {
  const root = options.root ?? mkdtempSync(join(tmpdir(), 'di-legacy-'))
  const projectRoot = options.workspaceRoot ?? join(root, 'project-a')
  const legacyDir = join(root, 'legacy', 'project')
  const host = {
    getStorageDir: (scope: string) => join(projectRoot, '.storage', scope),
    ...(options.legacy === false
      ? {}
      : {
          getLegacyStorageDir: (scope: string) => join(root, 'legacy', scope),
        }),
  }
  return {
    // The legacy import only reads the host calls and `workspaceRoot`; the
    // rest of the wide DevframeNodeContext surface is irrelevant here.
    // eslint-disable-next-line slop/no-chained-type-assertions -- minimal stub for an unused-surface boundary
    ctx: { workspaceRoot: projectRoot, host } as unknown as DevframeNodeContext,
    root,
    projectRoot,
    legacyDir,
  }
}

function writeLegacy(legacyDir: string, records: LegacyRecord[]): void {
  const dir = join(legacyDir, 'data-inspector')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'queries.json'),
    JSON.stringify({
      queries: Object.fromEntries(records.map(record => [record.id, record])),
    }),
  )
}

function legacyRecord(id: string, updatedAt: number, query = 'keys()'): LegacyRecord {
  return { id, query, title: id, updatedAt }
}

/** `createStorage` debounces writes; give the claim sidecar time to land. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 250))
}

describe('legacy saved-query import', () => {
  it('reports nothing when the host exposes no legacy directory', () => {
    const { ctx } = fixture({ legacy: false })
    expect(listLegacyQueries(ctx)).toEqual({ records: [], total: 0 })
    expect(resolveLegacyQueries(ctx, ['anything'], 'claim')).toEqual({ records: [], total: 0 })
  })

  it('lists unclaimed records newest first and counts the whole file', () => {
    const { ctx, legacyDir } = fixture()
    writeLegacy(legacyDir, [
      legacyRecord('older', 1),
      legacyRecord('newer', 2),
      legacyRecord('oldest', 0),
    ])

    const report = listLegacyQueries(ctx)
    expect(report.total).toBe(3)
    expect(report.records.map(record => record.id)).toEqual(['newer', 'older', 'oldest'])
    // The legacy file has no scope; the report presents them as project state.
    expect(report.records.every(record => record.scope === 'project')).toBe(true)
  })

  it('claims records into the current project and records the claiming project', async () => {
    const { ctx, legacyDir } = fixture()
    writeLegacy(legacyDir, [
      legacyRecord('keep', 2),
      legacyRecord('later', 1),
    ])

    const report = resolveLegacyQueries(ctx, ['keep'], 'claim')
    expect(report.records.map(record => record.id)).toEqual(['later'])

    const saved = listSavedQueries(ctx)
    expect(saved.map(entry => entry.id)).toEqual(['keep'])
    expect(saved[0]!.scope).toBe('project')

    await flush()
    const claims = JSON.parse(readFileSync(join(legacyDir, 'data-inspector', 'queries.claims.json'), 'utf-8'))
    expect(claims.claims.keep).toMatchObject({ project: ctx.workspaceRoot, mode: 'claim' })
    // The kit-written file is never rewritten by the import.
    const legacyFile = JSON.parse(readFileSync(join(legacyDir, 'data-inspector', 'queries.json'), 'utf-8'))
    expect(Object.keys(legacyFile.queries)).toEqual(['keep', 'later'])
  })

  it('keeps a same-id workspace query when a claimed record lands in the project store', () => {
    const { ctx, legacyDir } = fixture()
    saveQuery(ctx, {
      id: 'shared',
      title: 'Shared',
      query: 'config',
      scope: 'workspace',
    })
    writeLegacy(legacyDir, [
      legacyRecord('shared', 1, 'config.alias'),
    ])

    resolveLegacyQueries(ctx, ['shared'], 'claim')

    const byScope = listSavedQueries(ctx).filter(entry => entry.id === 'shared')
    expect(byScope.map(entry => entry.scope).sort()).toEqual(['project', 'workspace'])
    expect(byScope.find(entry => entry.scope === 'project')?.query).toBe('config.alias')
  })

  it('discards without writing to the project store', async () => {
    const { ctx, legacyDir } = fixture()
    writeLegacy(legacyDir, [
      legacyRecord('junk', 1),
    ])

    expect(resolveLegacyQueries(ctx, ['junk'], 'discard')).toEqual({ records: [], total: 1 })
    expect(listSavedQueries(ctx)).toHaveLength(0)

    await flush()
    const claims = JSON.parse(readFileSync(join(legacyDir, 'data-inspector', 'queries.claims.json'), 'utf-8'))
    expect(claims.claims.junk).toMatchObject({ mode: 'discard' })
  })

  it('leaves only unclaimed records for the next project on the machine', async () => {
    const first = fixture({ workspaceRoot: '/tmp/checkout-a' })
    writeLegacy(first.legacyDir, [
      legacyRecord('mine', 2),
      legacyRecord('undeclared', 1),
    ])
    resolveLegacyQueries(first.ctx, ['mine'], 'claim')
    await flush()

    // Same legacy directory, other checkout: the claimed record is not offered
    // again, so one project's private queries never leak into another.
    const second = fixture({ workspaceRoot: '/tmp/checkout-b', root: first.root })
    const report = listLegacyQueries(second.ctx)
    expect(report.total).toBe(2)
    expect(report.records.map(record => record.id)).toEqual(['undeclared'])
    expect(listSavedQueries(second.ctx)).toHaveLength(0)
  })

  it('reports an empty list but the full count once every record is claimed', async () => {
    const { ctx, legacyDir } = fixture()
    writeLegacy(legacyDir, [
      legacyRecord('a', 1),
      legacyRecord('b', 2),
    ])

    resolveLegacyQueries(ctx, ['a', 'b'], 'discard')
    await flush()

    const report = listLegacyQueries(ctx)
    expect(report.records).toEqual([])
    // Detectable state: nothing left to import, while the file is still there.
    expect(report.total).toBe(2)
    expect(existsSync(join(legacyDir, 'data-inspector', 'queries.json'))).toBe(true)
  })

  it('ignores ids that are not in the legacy file or already claimed', async () => {
    const { ctx, legacyDir } = fixture()
    writeLegacy(legacyDir, [
      legacyRecord('a', 1),
    ])
    resolveLegacyQueries(ctx, ['a'], 'claim')
    await flush()

    expect(resolveLegacyQueries(ctx, ['a', 'missing'], 'discard').records).toEqual([])
    expect(listSavedQueries(ctx)).toHaveLength(1)
  })
})
