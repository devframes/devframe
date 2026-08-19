import type { DevframeHost } from 'devframe/types'
import type { GitServiceApi } from '../src/index'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHostContext } from 'devframe/node'
import { afterEach, describe, expect, it } from 'vitest'
import { createGitService } from '../src/index'
import { createTempDir, createTempRepo } from './_repo'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanups.splice(0))
    fn()
})

function nullHost(dir: string): DevframeHost {
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost',
    getStorageDir: () => join(dir, '.storage'),
  }
}

/** Install the git service against `cwd` and return its node API. */
async function createGit(cwd: string): Promise<GitServiceApi> {
  const ctx = await createHostContext({ cwd, mode: 'dev', host: nullHost(cwd) })
  const install = ctx.services.install(createGitService())
  await ctx.services.ready()
  return (await install)!
}

describe('@devframes/service-git', () => {
  it('reports branch, staged, unstaged, and untracked status', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const git = await createGit(repo.dir)

    const status = await git.status()
    expect(status.isRepo).toBe(true)
    expect(status.branch).toBe('main')
    expect(status.detached).toBe(false)
    expect(status.head).toMatch(/^[0-9a-f]+$/)
    expect(status.clean).toBe(false)
    expect(status.canWrite).toBe(true)
    expect(status.staged).toContainEqual({ path: 'staged.txt', status: 'added' })
    expect(status.unstaged).toContainEqual({ path: 'README.md', status: 'modified' })
    expect(status.untracked).toContain('untracked.txt')
  })

  it('returns the commit log newest-first with parents', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const git = await createGit(repo.dir)

    const log = await git.log({ limit: 30 })
    expect(log.commits).toHaveLength(2)
    expect(log.commits[0].subject).toBe('feat: add a.txt')
    expect(log.commits[1].subject).toBe('init: add readme')
    expect(log.commits[0].parents).toEqual([log.commits[1].hash])
    expect(log.hasMore).toBe(false)
  })

  it('paginates the log and flags more history', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const git = await createGit(repo.dir)

    const page = await git.log({ limit: 1 })
    expect(page.commits).toHaveLength(1)
    expect(page.hasMore).toBe(true)
    const tail = await git.log({ limit: 1, skip: 2 })
    expect(tail.commits).toHaveLength(0)
    expect(tail.hasMore).toBe(false)
  })

  it('treats dashed revisions as invalid instead of git options (log + show)', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const git = await createGit(repo.dir)

    const logMarker = join(repo.dir, 'log-injected.txt')
    const log = await git.log({ ref: `--output=${logMarker}` })
    expect(log.commits).toEqual([])
    expect(existsSync(logMarker)).toBe(false)

    const showMarker = join(repo.dir, 'show-injected.txt')
    const detail = await git.show({ hash: `--output=${showMarker}` })
    expect(detail.found).toBe(false)
    expect(existsSync(showMarker)).toBe(false)
  })

  it('returns commit details with per-file change kinds', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const git = await createGit(repo.dir)

    const log = await git.log({ limit: 1 })
    const detail = await git.show({ hash: log.commits[0].hash })
    expect(detail.found).toBe(true)
    expect(detail.files.find(f => f.path === 'a.txt')?.status).toBe('added')
  })

  it('lists local branches, current first', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const git = await createGit(repo.dir)

    const result = await git.branches()
    expect(result.current).toBe('main')
    expect(result.branches[0].current).toBe(true)
    expect(result.branches.map(b => b.name).sort()).toEqual(['feature/x', 'main'])
  })

  it('summarizes working-tree, staged, and single-path diffs', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const git = await createGit(repo.dir)

    const wt = await git.diff()
    expect(wt.staged).toBe(false)
    expect(wt.files.map(f => f.path)).toContain('README.md')
    expect(wt.files.map(f => f.path)).not.toContain('staged.txt')
    expect(wt.patch).toBeNull()

    const staged = await git.diff({ staged: true })
    expect(staged.files.map(f => f.path)).toContain('staged.txt')

    const single = await git.diff({ path: 'README.md' })
    expect(single.path).toBe('README.md')
    expect(single.patch).toContain('+more')
  })

  it('stages, unstages, and commits (writes always available)', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const git = await createGit(repo.dir)

    let status = await git.stage({ paths: ['README.md', 'untracked.txt'] })
    expect(status.staged.map(f => f.path)).toEqual(
      expect.arrayContaining(['staged.txt', 'README.md', 'untracked.txt']),
    )
    status = await git.unstage({ paths: ['staged.txt'] })
    expect(status.staged.map(f => f.path)).not.toContain('staged.txt')

    const result = await git.commit({ message: 'test: commit from service' })
    expect(result.ok).toBe(true)
    expect(result.hash).toMatch(/^[0-9a-f]+$/)
    const log = await git.log({})
    expect(log.commits[0].subject).toBe('test: commit from service')
  })

  it('rejects an empty commit message', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const git = await createGit(repo.dir)
    const result = await git.commit({ message: '   ' })
    expect(result.ok).toBe(false)
    expect(result.hash).toBeNull()
  })

  it('degrades gracefully outside a git repository', async () => {
    const dir = createTempDir()
    cleanups.push(dir.cleanup)
    const git = await createGit(dir.dir)

    expect((await git.status()).isRepo).toBe(false)
    expect((await git.log({})).isRepo).toBe(false)
    expect((await git.branches()).isRepo).toBe(false)
    expect((await git.diff()).isRepo).toBe(false)
  })

  it('registers scoped RPC that mirrors the node API', async () => {
    const repo = createTempRepo()
    cleanups.push(repo.cleanup)
    const ctx = await createHostContext({ cwd: repo.dir, mode: 'dev', host: nullHost(repo.dir) })
    void ctx.services.install(createGitService())
    await ctx.services.ready()

    const status = await (ctx.rpc.invokeLocal as (m: string, ...a: unknown[]) => Promise<{ isRepo: boolean }>)(
      'devframes:service:git:status',
    )
    expect(status.isRepo).toBe(true)
  })
})
