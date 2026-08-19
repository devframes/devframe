import type { CommitDetail, CommitResult, GitBranches, GitDiff, GitLog, GitStatus } from '@devframes/service-git'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { applySnapshotRpc } from 'devframe/adapters/build'
import { createRpcClient } from 'devframe/rpc/client'
import { collectStaticRpcDump } from 'devframe/rpc/dump'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import createGitDevframe from '../src/index'
import { createTempRepo } from './_repo'
import { createDashboardContext, startDashboardServer } from './_utils'

vi.stubGlobal('WebSocket', WebSocket)

function bootRpc(port: number) {
  const channel = createWsRpcChannel({ url: `ws://127.0.0.1:${port}` })
  return createRpcClient<any, any>({}, { channel })
}

// The plugin now owns no git logic — these are integration checks that it
// declares `@devframes/service-git` and the SPA can reach it over RPC. The
// git behavior itself is covered by `services/git`.
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
    const meta = await res.json() as { backend: string, websocket: number }
    expect(meta.backend).toBe('websocket')
    expect(meta.websocket).toBe(server.port)
  })

  it('exposes the git service RPC the SPA calls', async () => {
    const rpc = bootRpc(server.port)
    const status = await rpc.$call('devframes:service:git:status') as GitStatus
    expect(status.isRepo).toBe(true)
    expect(status.branch).toBe('main')
    expect(status.canWrite).toBe(true)

    const log = await rpc.$call('devframes:service:git:log', { limit: 30 }) as GitLog
    expect(log.commits[0].subject).toBe('feat: add a.txt')

    const branches = await rpc.$call('devframes:service:git:branches', {}) as GitBranches
    expect(branches.current).toBe('main')

    const diff = await rpc.$call('devframes:service:git:diff', {}) as GitDiff
    expect(diff.files.map(f => f.path)).toContain('README.md')
  })

  it('stages, unstages, and commits over the service RPC', async () => {
    const rpc = bootRpc(server.port)
    await rpc.$call('devframes:service:git:stage', { paths: ['README.md'] })
    const result = await rpc.$call('devframes:service:git:commit', { message: 'test: commit from ui' }) as CommitResult
    expect(result.ok).toBe(true)
    const log = await rpc.$call('devframes:service:git:log', {}) as GitLog
    expect(log.commits[0].subject).toBe('test: commit from ui')
  })
})

describe('@devframes/plugin-git (snapshotRpc build baking)', () => {
  it('bakes the git service read ops declared in snapshotRpc', async () => {
    const repo = createTempRepo()
    try {
      const ctx = await createDashboardContext(repo.dir, 'build')
      // Mirror `createBuild`: honor the definition's `snapshotRpc` before collecting.
      applySnapshotRpc(ctx, createGitDevframe().snapshotRpc)
      const dump = await collectStaticRpcDump(ctx.rpc.definitions.values(), ctx)

      const status = dump.manifest['devframes:service:git:status']
      expect(status?.type).toBe('query')
      expect(status.fallback).toBeTruthy()
      const baked = (dump.files[status.fallback].data as { output: GitStatus }).output
      expect(baked.isRepo).toBe(true)
      expect(baked.branch).toBe('main')

      // `show` is enumerated at build time (one record per commit, patch-less).
      const show = dump.manifest['devframes:service:git:show']
      expect(Object.keys(show.records)).toHaveLength(2)
      const details = Object.values(show.records as Record<string, string>)
        .map(path => (dump.files[path].data as { output: CommitDetail }).output)
      expect(details.map(d => d.subject)).toEqual(['feat: add a.txt', 'init: add readme'])
      expect(details.every(d => d.found && d.patch === null)).toBe(true)
    }
    finally {
      repo.cleanup()
    }
  })
})

// A dashed-revision marker guard, exercised end-to-end through the plugin's
// service wiring (the service enforces `isSafeRevision`).
describe('@devframes/plugin-git (revision safety)', () => {
  it('does not treat a dashed ref as a git option', async () => {
    const repo = createTempRepo()
    const server = await startDashboardServer(repo.dir)
    try {
      const rpc = bootRpc(server.port)
      const marker = join(repo.dir, 'injected.txt')
      const log = await rpc.$call('devframes:service:git:log', { ref: `--output=${marker}` }) as GitLog
      expect(log.commits).toEqual([])
      expect(existsSync(marker)).toBe(false)
    }
    finally {
      await server.close()
      repo.cleanup()
    }
  })
})
