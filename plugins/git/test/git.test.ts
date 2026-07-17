import type { CommitDetail, CommitResult, GitBranches, GitDiff, GitLog, GitStatus } from '../src/index'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRpcClient } from 'devframe/rpc/client'
import { collectStaticRpcDump } from 'devframe/rpc/dump'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { createTempDir, createTempRepo } from './_repo'
import { createDashboardContext, startDashboardServer } from './_utils'

vi.stubGlobal('WebSocket', WebSocket)

function bootRpc(port: number) {
  const channel = createWsRpcChannel({ url: `ws://127.0.0.1:${port}` })
  return createRpcClient<any, any>({}, { channel })
}

describe('@devframes/plugin-git', () => {
  let repo: ReturnType<typeof createTempRepo>
  let server: Awaited<ReturnType<typeof startDashboardServer>>

  beforeEach(async () => {
    repo = createTempRepo()
    server = await startDashboardServer(repo.dir)
  })

  afterEach(async () => {
    await server?.close()
    repo?.cleanup()
  })

  it('serves connection meta pointing at the WS backend', async () => {
    const res = await fetch(`${server.origin}${server.basePath}__connection.json`)
    expect(res.status).toBe(200)
    const meta = await res.json() as { backend: string, websocket: number }
    expect(meta.backend).toBe('websocket')
    expect(meta.websocket).toBe(server.port)
  })

  it('reports branch, staged, unstaged, and untracked status', async () => {
    const rpc = bootRpc(server.port)
    const status = await rpc.$call('devframes:plugin:git:status') as GitStatus
    expect(status.isRepo).toBe(true)
    expect(status.branch).toBe('main')
    expect(status.detached).toBe(false)
    expect(status.head).toMatch(/^[0-9a-f]+$/)
    expect(status.clean).toBe(false)

    expect(status.staged).toContainEqual({ path: 'staged.txt', status: 'added' })
    expect(status.unstaged).toContainEqual({ path: 'README.md', status: 'modified' })
    expect(status.untracked).toContain('untracked.txt')
  })

  it('returns the commit log newest-first', async () => {
    const rpc = bootRpc(server.port)
    const log = await rpc.$call('devframes:plugin:git:log', { limit: 30 }) as GitLog
    expect(log.isRepo).toBe(true)
    expect(log.commits).toHaveLength(2)
    expect(log.commits[0].subject).toBe('feat: add a.txt')
    expect(log.commits[1].subject).toBe('init: add readme')
    expect(log.commits[0].author).toBe('Test User')
    expect(log.commits[0].email).toBe('test@example.com')
    expect(typeof log.commits[0].date).toBe('number')
    expect(log.hasMore).toBe(false)
    // Parents drive the commit graph: the tip points at the root, which has none.
    expect(log.commits[1].parents).toEqual([])
    expect(log.commits[0].parents).toEqual([log.commits[1].hash])
  })

  it('paginates the log and flags more history', async () => {
    const rpc = bootRpc(server.port)
    const page = await rpc.$call('devframes:plugin:git:log', { limit: 1 }) as GitLog
    expect(page.commits).toHaveLength(1)
    expect(page.commits[0].subject).toBe('feat: add a.txt')
    expect(page.hasMore).toBe(true)

    const next = await rpc.$call('devframes:plugin:git:log', { limit: 1, skip: 1 }) as GitLog
    expect(next.commits).toHaveLength(1)
    expect(next.commits[0].subject).toBe('init: add readme')
    expect(next.hasMore).toBe(true)

    const tail = await rpc.$call('devframes:plugin:git:log', { limit: 1, skip: 2 }) as GitLog
    expect(tail.commits).toHaveLength(0)
    expect(tail.hasMore).toBe(false)
  })

  it('treats dashed log refs as invalid revisions instead of Git options', async () => {
    const rpc = bootRpc(server.port)
    const marker = join(repo.dir, 'log-injected.txt')

    const log = await rpc.$call('devframes:plugin:git:log', { ref: `--output=${marker}` }) as GitLog

    expect(log.isRepo).toBe(true)
    expect(log.commits).toEqual([])
    expect(log.hasMore).toBe(false)
    expect(existsSync(marker)).toBe(false)
  })

  it('treats dashed show hashes as invalid revisions instead of Git options', async () => {
    const rpc = bootRpc(server.port)
    const marker = join(repo.dir, 'show-injected.txt')

    const detail = await rpc.$call('devframes:plugin:git:show', { hash: `--output=${marker}` }) as CommitDetail

    expect(detail.isRepo).toBe(true)
    expect(detail.found).toBe(false)
    expect(existsSync(marker)).toBe(false)
  })

  it('returns commit details for a valid hash', async () => {
    const rpc = bootRpc(server.port)
    const log = await rpc.$call('devframes:plugin:git:log', { limit: 1 }) as GitLog

    const detail = await rpc.$call('devframes:plugin:git:show', { hash: log.commits[0].hash }) as CommitDetail

    expect(detail.isRepo).toBe(true)
    expect(detail.found).toBe(true)
    expect(detail.hash).toBe(log.commits[0].hash)
    expect(detail.files.map(file => file.path)).toContain('a.txt')
    // Each changed file carries its change kind (add / modify / delete …).
    expect(detail.files.find(file => file.path === 'a.txt')?.status).toBe('added')
  })

  it('lists local branches with the current one first', async () => {
    const rpc = bootRpc(server.port)
    const result = await rpc.$call('devframes:plugin:git:branches', {}) as GitBranches
    expect(result.isRepo).toBe(true)
    expect(result.current).toBe('main')
    expect(result.branches).toHaveLength(2)
    expect(result.branches[0].current).toBe(true)
    expect(result.branches[0].name).toBe('main')
    expect(result.branches.map(b => b.name).sort()).toEqual(['feature/x', 'main'])
  })

  it('summarizes the working-tree diff', async () => {
    const rpc = bootRpc(server.port)
    const diff = await rpc.$call('devframes:plugin:git:diff', {}) as GitDiff
    expect(diff.isRepo).toBe(true)
    expect(diff.staged).toBe(false)
    expect(diff.files.map(f => f.path)).toContain('README.md')
    // Staged and untracked files don't appear in the working-tree diff.
    expect(diff.files.map(f => f.path)).not.toContain('staged.txt')
    expect(diff.totalAdditions).toBeGreaterThan(0)
    expect(diff.patch).toBeNull()
  })

  it('summarizes the staged diff', async () => {
    const rpc = bootRpc(server.port)
    const diff = await rpc.$call('devframes:plugin:git:diff', { staged: true }) as GitDiff
    expect(diff.staged).toBe(true)
    expect(diff.files.map(f => f.path)).toContain('staged.txt')
  })

  it('returns a unified patch for a single path', async () => {
    const rpc = bootRpc(server.port)
    const diff = await rpc.$call('devframes:plugin:git:diff', { path: 'README.md' }) as GitDiff
    expect(diff.path).toBe('README.md')
    expect(diff.files.map(f => f.path)).toEqual(['README.md'])
    expect(diff.patch).toContain('+more')
    expect(diff.truncated).toBe(false)
  })
})

describe('@devframes/plugin-git (non-repo directory)', () => {
  let dir: ReturnType<typeof createTempDir>
  let server: Awaited<ReturnType<typeof startDashboardServer>>

  beforeEach(async () => {
    dir = createTempDir()
    server = await startDashboardServer(dir.dir)
  })

  afterEach(async () => {
    await server?.close()
    dir?.cleanup()
  })

  it('degrades gracefully outside a git repository', async () => {
    const rpc = bootRpc(server.port)
    const status = await rpc.$call('devframes:plugin:git:status') as GitStatus
    expect(status.isRepo).toBe(false)
    expect(status.branch).toBeNull()
    expect(status.clean).toBe(true)

    const log = await rpc.$call('devframes:plugin:git:log', {}) as GitLog
    expect(log.isRepo).toBe(false)
    expect(log.commits).toEqual([])

    const branches = await rpc.$call('devframes:plugin:git:branches', {}) as GitBranches
    expect(branches.isRepo).toBe(false)

    const diff = await rpc.$call('devframes:plugin:git:diff', {}) as GitDiff
    expect(diff.isRepo).toBe(false)
    expect(diff.files).toEqual([])
  })
})

describe('@devframes/plugin-git (build snapshot)', () => {
  it('bakes a status snapshot for static deployment', async () => {
    const repo = createTempRepo()
    try {
      const ctx = await createDashboardContext(repo.dir, 'build')
      const dump = await collectStaticRpcDump(ctx.rpc.definitions.values(), ctx)

      const entry = dump.manifest['devframes:plugin:git:status']
      expect(entry).toBeDefined()
      expect(entry.type).toBe('query')
      expect(entry.fallback).toBeTruthy()

      // The baked fallback is what a static client returns for any call.
      const file = dump.files[entry.fallback]
      const status = (file.data as { output: GitStatus }).output
      expect(status.isRepo).toBe(true)
      expect(status.branch).toBe('main')
    }
    finally {
      repo.cleanup()
    }
  })

  it('bakes git:show records for the log snapshot window', async () => {
    const repo = createTempRepo()
    try {
      const ctx = await createDashboardContext(repo.dir, 'build')
      const dump = await collectStaticRpcDump(ctx.rpc.definitions.values(), ctx)

      const entry = dump.manifest['devframes:plugin:git:show']
      expect(entry).toBeDefined()
      expect(entry.type).toBe('query')
      expect(Object.keys(entry.records)).toHaveLength(2)
      expect(entry.fallback).toBeTruthy()

      const recordPaths = Object.values(entry.records as Record<string, string>)
      const details = recordPaths.map((path) => {
        return (dump.files[path].data as { output: CommitDetail }).output
      })

      expect(details.map(detail => detail.subject)).toEqual([
        'feat: add a.txt',
        'init: add readme',
      ])
      expect(details.every(detail => detail.isRepo && detail.found)).toBe(true)
      expect(details.every(detail => detail.patch === null)).toBe(true)
      expect(details[0].files.map(file => file.path)).toContain('a.txt')
    }
    finally {
      repo.cleanup()
    }
  })
})

describe('@devframes/plugin-git (write actions)', () => {
  it('stages, unstages, and commits when write is enabled', async () => {
    const repo = createTempRepo()
    const server = await startDashboardServer(repo.dir, { write: true })
    try {
      const rpc = bootRpc(server.port)

      const initial = await rpc.$call('devframes:plugin:git:status') as GitStatus
      expect(initial.canWrite).toBe(true)

      // Stage the unstaged + untracked files.
      let status = await rpc.$call('devframes:plugin:git:stage', { paths: ['README.md', 'untracked.txt'] }) as GitStatus
      expect(status.staged.map(f => f.path)).toEqual(
        expect.arrayContaining(['staged.txt', 'README.md', 'untracked.txt']),
      )
      expect(status.untracked).not.toContain('untracked.txt')

      // Unstage one of them again.
      status = await rpc.$call('devframes:plugin:git:unstage', { paths: ['staged.txt'] }) as GitStatus
      expect(status.staged.map(f => f.path)).not.toContain('staged.txt')

      // Commit what's left staged.
      const result = await rpc.$call('devframes:plugin:git:commit', { message: 'test: commit from ui' }) as CommitResult
      expect(result.ok).toBe(true)
      expect(result.hash).toMatch(/^[0-9a-f]+$/)

      const log = await rpc.$call('devframes:plugin:git:log', {}) as GitLog
      expect(log.commits[0].subject).toBe('test: commit from ui')
    }
    finally {
      await server.close()
      repo.cleanup()
    }
  })

  it('rejects an empty commit message', async () => {
    const repo = createTempRepo()
    const server = await startDashboardServer(repo.dir, { write: true })
    try {
      const rpc = bootRpc(server.port)
      const result = await rpc.$call('devframes:plugin:git:commit', { message: '   ' }) as CommitResult
      expect(result.ok).toBe(false)
      expect(result.hash).toBeNull()
    }
    finally {
      await server.close()
      repo.cleanup()
    }
  })

  it('omits write actions when write is disabled', async () => {
    const repo = createTempRepo()
    const server = await startDashboardServer(repo.dir)
    try {
      const rpc = bootRpc(server.port)
      const status = await rpc.$call('devframes:plugin:git:status') as GitStatus
      expect(status.canWrite).toBe(false)
      await expect(rpc.$call('devframes:plugin:git:stage', { paths: ['README.md'] })).rejects.toBeDefined()
    }
    finally {
      await server.close()
      repo.cleanup()
    }
  })
})
