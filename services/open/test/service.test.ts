import type { DevframeHost } from 'devframe/types'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostContext } from 'devframe/node'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenService } from '../src/index'

const launchEditor = vi.fn()
const open = vi.fn()
vi.mock('devframe/utils/launch-editor', () => ({ launchEditor: (...args: unknown[]) => launchEditor(...args) }))
vi.mock('devframe/utils/open', () => ({ open: async (...args: unknown[]) => open(...args) }))

const tempDirs: string[] = []

afterEach(() => {
  vi.clearAllMocks()
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

function createTestHost(dir: string): DevframeHost {
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost',
    getStorageDir: scope => join(dir, scope),
  }
}

async function createCtx() {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-service-open-'))
  tempDirs.push(dir)
  const ctx = await createHostContext({ cwd: dir, mode: 'dev', host: createTestHost(dir) })
  return { ctx, dir }
}

function invoke(ctx: Awaited<ReturnType<typeof createCtx>>['ctx'], method: string, ...args: unknown[]) {
  return (ctx.rpc.invokeLocal as (method: string, ...args: unknown[]) => Promise<unknown>)(method, ...args)
}

describe('@devframes/service-open', () => {
  it('registers scoped RPC and opens contained files with line/column', async () => {
    const { ctx, dir } = await createCtx()
    const install = ctx.services.install(createOpenService())
    await ctx.services.ready()
    const api = await install

    await invoke(ctx, 'devframes:service:open:open-in-editor', { path: join(dir, 'src/a.ts'), line: 3, column: 7 })
    expect(launchEditor).toHaveBeenCalledWith(`${join(dir, 'src/a.ts')}:3:7`, undefined)

    await api!.openInFinder({ path: join(dir, 'src') })
    expect(open).toHaveBeenCalledWith(join(dir, 'src'))
  })

  it('prefers the per-call editor over the merged option', async () => {
    const { ctx, dir } = await createCtx()
    void ctx.services.install(createOpenService({ editor: 'code' }))
    await ctx.services.ready()

    await invoke(ctx, 'devframes:service:open:open-in-editor', { path: join(dir, 'a.ts') })
    expect(launchEditor).toHaveBeenLastCalledWith(join(dir, 'a.ts'), 'code')

    await invoke(ctx, 'devframes:service:open:open-in-editor', { path: join(dir, 'a.ts'), editor: 'zed' })
    expect(launchEditor).toHaveBeenLastCalledWith(join(dir, 'a.ts'), 'zed')
  })

  it('refuses relative paths and paths outside the allowed roots', async () => {
    const { ctx } = await createCtx()
    const install = ctx.services.install(createOpenService())
    await ctx.services.ready()
    const api = await install

    await expect(api!.openInEditor({ path: 'src/a.ts' })).rejects.toThrowError(/not absolute/)
    await expect(api!.openInFinder({ path: '/etc/passwd' })).rejects.toThrowError(/outside the workspace root/)
    expect(launchEditor).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('merges roots as a union so extra directories become openable', async () => {
    const { ctx } = await createCtx()
    const extra = mkdtempSync(join(tmpdir(), 'devframe-service-open-extra-'))
    tempDirs.push(extra)
    void ctx.services.install(createOpenService({ roots: [extra] }))
    void ctx.services.install({ package: '@devframes/service-open', options: { editor: 'zed' } })
    await ctx.services.ready()

    await invoke(ctx, 'devframes:service:open:open-in-editor', { path: join(extra, 'b.ts') })
    // Union kept the first installer's roots; later editor option won.
    expect(launchEditor).toHaveBeenCalledWith(join(extra, 'b.ts'), 'zed')
  })

  it('rejects unknown editor commands at the RPC boundary', async () => {
    const { ctx, dir } = await createCtx()
    void ctx.services.install(createOpenService())
    await ctx.services.ready()

    await expect(
      invoke(ctx, 'devframes:service:open:open-in-editor', { path: join(dir, 'a.ts'), editor: 'rm -rf /' }),
    ).rejects.toThrow()
    expect(launchEditor).not.toHaveBeenCalled()
  })
})
