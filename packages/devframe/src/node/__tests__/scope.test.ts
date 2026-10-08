import type { DevframeHost } from 'devframe/types'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineRpcFunction } from 'devframe'
import { afterEach, describe, expect, it } from 'vitest'
import { createHostContext } from '../context'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function createTestHost(dir: string): DevframeHost {
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost',
    getStorageDir: scope => join(dir, scope),
  }
}

async function createCtx() {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-scope-'))
  tempDirs.push(dir)
  const ctx = await createHostContext({ cwd: dir, mode: 'dev', host: createTestHost(dir) })
  return { ctx, dir }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('ctx.scope()', () => {
  it('memoizes the scoped context per namespace', async () => {
    const { ctx } = await createCtx()
    expect(ctx.scope('my-plugin')).toBe(ctx.scope('my-plugin'))
    expect(ctx.scope('my-plugin')).not.toBe(ctx.scope('other'))
  })

  it('un-scopes and returns the base context when passed null or empty string', async () => {
    const { ctx } = await createCtx()
    const scoped = ctx.scope('my-plugin')
    expect(ctx.scope('')).toBe(ctx)
    expect(ctx.scope(null)).toBe(ctx)
    expect(scoped.scope('')).toBe(ctx)
    expect(scoped.scope(null)).toBe(ctx)
  })

  it('replaces the scope instead of chaining when calling scope() on a scoped context', async () => {
    const { ctx } = await createCtx()
    const scope1 = ctx.scope('first')
    const scope2 = scope1.scope('second')
    expect(scope2.namespace).toBe('second')
  })

  it('exposes the base context and read-only fields', async () => {
    const { ctx } = await createCtx()
    const scoped = ctx.scope('my-plugin')
    expect(scoped.namespace).toBe('my-plugin')
    expect(scoped.base).toBe(ctx)
    expect(scoped.cwd).toBe(ctx.cwd)
    expect(scoped.mode).toBe('dev')
    expect(scoped.rpc.namespace).toBe('my-plugin')
  })

  describe('rpc.register', () => {
    it('auto-namespaces bare function names', async () => {
      const { ctx } = await createCtx()
      ctx.scope('my-plugin').rpc.register(defineRpcFunction({
        name: 'get-cwd',
        type: 'query',
        setup: () => ({ handler: async () => 'value' }),
      }))
      expect(ctx.rpc.definitions.has('my-plugin:get-cwd')).toBe(true)
      expect(ctx.rpc.definitions.has('get-cwd')).toBe(false)
    })

    it('throws DF0034 on an already-namespaced name', async () => {
      const { ctx } = await createCtx()
      const register = () => ctx.scope('my-plugin').rpc.register(defineRpcFunction({
        name: 'my-plugin:get-cwd',
        type: 'query',
        setup: () => ({ handler: async () => 'value' }),
      }))
      expect(register).toThrow('already-namespaced')
      expect(register).toThrow('my-plugin:get-cwd')
    })
  })

  describe('rpc.call', () => {
    it('invokes a locally registered function by bare name', async () => {
      const { ctx } = await createCtx()
      const scoped = ctx.scope('my-plugin')
      scoped.rpc.register(defineRpcFunction({
        name: 'add',
        type: 'query',
        setup: () => ({ handler: async (a: number, b: number) => a + b }),
      }))
      await expect(scoped.rpc.call('add' as any, 2, 3)).resolves.toBe(5)
    })

    it('passes through fully-qualified names unchanged', async () => {
      const { ctx } = await createCtx()
      ctx.rpc.register(defineRpcFunction({
        name: 'other-plugin:ping',
        type: 'query',
        setup: () => ({ handler: async () => 'pong' }),
      }))
      await expect(ctx.scope('my-plugin').rpc.call('other-plugin:ping' as any)).resolves.toBe('pong')
    })
  })

  describe('rpc.sharedState', () => {
    it('auto-namespaces the state key', async () => {
      const { ctx } = await createCtx()
      const state = await ctx.scope('my-plugin').rpc.sharedState('messages', { initialValue: { items: [] as string[] } })
      state.mutate((draft) => {
        draft.items.push('hello')
      })
      expect(ctx.rpc.sharedState.keys()).toContain('my-plugin:messages')
      const direct = await (ctx.rpc.sharedState.get as any)('my-plugin:messages')
      expect((direct.value() as any).items).toEqual(['hello'])
    })
  })

  describe('rpc.streaming', () => {
    it('auto-namespaces the channel name', async () => {
      const { ctx } = await createCtx()
      const channel = ctx.scope('my-plugin').rpc.streaming.create('chat')
      expect(channel.name).toBe('my-plugin:chat')
    })
  })

  describe('settings', () => {
    it('round-trips get/set/all/delete', async () => {
      const { ctx } = await createCtx()
      const { settings } = ctx.scope('my-plugin')

      expect(await settings.project.get('theme')).toBeUndefined()
      await settings.project.set('theme', 'dark')
      expect(await settings.project.get('theme')).toBe('dark')
      expect(await settings.project.all()).toEqual({ theme: 'dark' })

      await settings.project.delete('theme')
      expect(await settings.project.get('theme')).toBeUndefined()
    })

    it('keeps project and global scopes independent', async () => {
      const { ctx } = await createCtx()
      const { settings } = ctx.scope('my-plugin')
      await settings.project.set('a', 1)
      await settings.global.set('b', 2)
      expect(await settings.project.all()).toEqual({ a: 1 })
      expect(await settings.global.all()).toEqual({ b: 2 })
    })

    it('registers settings stores as namespaced shared states', async () => {
      const { ctx } = await createCtx()
      await ctx.scope('my-plugin').settings.project.set('x', 1)
      expect(ctx.rpc.sharedState.keys()).toContain('devframe:settings:project:my-plugin')
    })

    it('persists to the project and global storage dirs', async () => {
      const { ctx, dir } = await createCtx()
      const { settings } = ctx.scope('my-plugin')
      await settings.project.set('theme', 'dark')
      await settings.global.set('token', 'abc')

      await sleep(250)

      // Project settings are per-checkout private state -> the host's
      // ignored 'project' dir (the committable 'workspace' dir is for
      // team-shared files).
      const projectFile = join(dir, 'project', 'settings', 'my-plugin.json')
      const globalFile = join(dir, 'global', 'settings', 'my-plugin.json')
      expect(existsSync(projectFile)).toBe(true)
      expect(existsSync(globalFile)).toBe(true)
      expect(JSON.parse(readFileSync(projectFile, 'utf-8'))).toEqual({ theme: 'dark' })
      expect(JSON.parse(readFileSync(globalFile, 'utf-8'))).toEqual({ token: 'abc' })
    })

    it.each(['project', 'global'] as const)('persists client-first %s settings and loads them on first RPC read', async (scope) => {
      const { ctx, dir } = await createCtx()
      const key = `devframe:settings:${scope}:client-only`
      // Exercise the handlers used by clients without touching node settings first.
      await ctx.rpc.invokeLocal('devframe:rpc:server-state:set', key, { theme: 'dark' }, 'client')
      await sleep(250)
      const restarted = await createHostContext({ cwd: dir, mode: 'dev', host: createTestHost(dir) })
      expect(await restarted.rpc.invokeLocal('devframe:rpc:server-state:get', key)).toEqual({ theme: 'dark' })
      expect(await restarted.scope('client-only').settings[scope].all()).toEqual({ theme: 'dark' })
    })

    it('loads existing settings for a client-first patch and shares the same state with node settings', async () => {
      const { ctx, dir } = await createCtx()
      await ctx.scope('my-plugin').settings.project.set('theme', 'dark')
      await sleep(250)
      const restarted = await createHostContext({ cwd: dir, mode: 'dev', host: createTestHost(dir) })
      const key = 'devframe:settings:project:my-plugin'
      await restarted.rpc.invokeLocal('devframe:rpc:server-state:patch', key, [{ op: 'add', path: ['zoom'], value: 2 }], 'client')
      expect(await restarted.scope('my-plugin').settings.project.all()).toEqual({ theme: 'dark', zoom: 2 })
      expect(await restarted.scope('other-plugin').settings.project.all()).toEqual({})
      expect(await restarted.scope('my-plugin').settings.global.all()).toEqual({})
      await sleep(250)
      expect(JSON.parse(readFileSync(join(dir, 'project/settings/my-plugin.json'), 'utf-8'))).toEqual({ theme: 'dark', zoom: 2 })
    })

    it.each(['ordinary:state', 'devframe:settings:workspace:plugin', 'devframe:settings:project:../escaped'])('keeps %s in memory', async (key) => {
      const { ctx, dir } = await createCtx()
      expect(await ctx.rpc.invokeLocal('devframe:rpc:server-state:get', key)).toBeUndefined()
      await ctx.rpc.invokeLocal('devframe:rpc:server-state:set', key, { value: 1 }, 'client')
      expect(await ctx.rpc.invokeLocal('devframe:rpc:server-state:get', key)).toEqual({ value: 1 })
      await sleep(250)
      expect(existsSync(join(dir, 'project'))).toBe(false)
      const restarted = await createHostContext({ cwd: dir, mode: 'dev', host: createTestHost(dir) })
      expect(await restarted.rpc.invokeLocal('devframe:rpc:server-state:get', key)).toBeUndefined()
    })

    it('notifies onChange subscribers', async () => {
      const { ctx } = await createCtx()
      const { settings } = ctx.scope('my-plugin')
      const seen: any[] = []
      await settings.project.onChange(value => seen.push(value))
      await settings.project.set('theme', 'light')
      expect(seen.at(-1)).toEqual({ theme: 'light' })
    })
  })
})
