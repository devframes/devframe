import type { GitBranches, GitDiff, GitLog, GitStatus } from '../src/index'
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
    const status = await rpc.$call('git:status') as GitStatus
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
    const log = await rpc.$call('git:log', { limit: 30 }) as GitLog
    expect(log.isRepo).toBe(true)
    expect(log.commits).toHaveLength(2)
    expect(log.commits[0].subject).toBe('feat: add a.txt')
    expect(log.commits[1].subject).toBe('init: add readme')
    expect(log.commits[0].author).toBe('Test User')
    expect(log.commits[0].email).toBe('test@example.com')
    expect(typeof log.commits[0].date).toBe('number')
    expect(log.hasMore).toBe(false)
  })

  it('paginates the log and flags more history', async () => {
    const rpc = bootRpc(server.port)
    const page = await rpc.$call('git:log', { limit: 1 }) as GitLog
    expect(page.commits).toHaveLength(1)
    expect(page.commits[0].subject).toBe('feat: add a.txt')
    expect(page.hasMore).toBe(true)
  })

  it('lists local branches with the current one first', async () => {
    const rpc = bootRpc(server.port)
    const result = await rpc.$call('git:branches', {}) as GitBranches
    expect(result.isRepo).toBe(true)
    expect(result.current).toBe('main')
    expect(result.branches).toHaveLength(2)
    expect(result.branches[0].current).toBe(true)
    expect(result.branches[0].name).toBe('main')
    expect(result.branches.map(b => b.name).sort()).toEqual(['feature/x', 'main'])
  })

  it('summarizes the working-tree diff', async () => {
    const rpc = bootRpc(server.port)
    const diff = await rpc.$call('git:diff', {}) as GitDiff
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
    const diff = await rpc.$call('git:diff', { staged: true }) as GitDiff
    expect(diff.staged).toBe(true)
    expect(diff.files.map(f => f.path)).toContain('staged.txt')
  })

  it('returns a unified patch for a single path', async () => {
    const rpc = bootRpc(server.port)
    const diff = await rpc.$call('git:diff', { path: 'README.md' }) as GitDiff
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
    const status = await rpc.$call('git:status') as GitStatus
    expect(status.isRepo).toBe(false)
    expect(status.branch).toBeNull()
    expect(status.clean).toBe(true)

    const log = await rpc.$call('git:log', {}) as GitLog
    expect(log.isRepo).toBe(false)
    expect(log.commits).toEqual([])

    const branches = await rpc.$call('git:branches', {}) as GitBranches
    expect(branches.isRepo).toBe(false)

    const diff = await rpc.$call('git:diff', {}) as GitDiff
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

      const entry = dump.manifest['git:status']
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
})
