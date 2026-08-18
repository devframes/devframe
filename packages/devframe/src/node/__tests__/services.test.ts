import type { DevframeHost, DevframeServiceDefinition, DevframeServicesState } from 'devframe/types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEVFRAME_SERVICES_STATE_KEY } from 'devframe/constants'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHostContext } from '../context'
import { DevframeServicesHostImpl } from '../host-services'

describe('devframeServicesHost', () => {
  it('provides and gets a service', () => {
    const services = new DevframeServicesHostImpl()
    const impl = { register: () => {} }
    services.provide('my-plugin:thing', impl)
    expect(services.get('my-plugin:thing')).toBe(impl)
    expect(services.has('my-plugin:thing')).toBe(true)
    expect(services.keys()).toEqual(['my-plugin:thing'])
  })

  it('throws DF0037 on duplicate provide', () => {
    const services = new DevframeServicesHostImpl()
    services.provide('a:s', 1)
    expect(() => services.provide('a:s', 2)).toThrowError(/already provided under "a:s"/)
  })

  it('revoke removes only the matching provider', () => {
    const services = new DevframeServicesHostImpl()
    const revoke = services.provide('a:s', 1)
    revoke()
    expect(services.has('a:s')).toBe(false)
    // A stale revoke from a previous provider must not remove a newer one.
    services.provide('a:s', 2)
    revoke()
    expect(services.get('a:s')).toBe(2)
  })

  it('whenAvailable fires immediately when already provided', () => {
    const services = new DevframeServicesHostImpl()
    services.provide('a:s', 41)
    const spy = vi.fn()
    services.whenAvailable('a:s', spy)
    expect(spy).toHaveBeenCalledWith(41)
  })

  it('whenAvailable fires on later provide (order independence)', () => {
    const services = new DevframeServicesHostImpl()
    const spy = vi.fn()
    services.whenAvailable('a:s', spy)
    expect(spy).not.toHaveBeenCalled()
    services.provide('a:s', 'late')
    expect(spy).toHaveBeenCalledWith('late')
  })

  it('whenAvailable re-fires after revoke + re-provide, and unsubscribes', () => {
    const services = new DevframeServicesHostImpl()
    const spy = vi.fn()
    const unsubscribe = services.whenAvailable('a:s', spy)
    const revoke = services.provide('a:s', 1)
    revoke()
    services.provide('a:s', 2)
    expect(spy).toHaveBeenCalledTimes(2)
    unsubscribe()
    services.get('a:s') // no-op
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

const tempDirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
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
  const dir = mkdtempSync(join(tmpdir(), 'devframe-services-'))
  tempDirs.push(dir)
  const ctx = await createHostContext({ cwd: dir, mode: 'dev', host: createTestHost(dir) })
  return { ctx, dir }
}

function defineTestService(overrides: Partial<DevframeServiceDefinition> = {}): DevframeServiceDefinition {
  return {
    package: '@test/svc',
    version: '1.2.3',
    scope: 'test:svc',
    setup: (_ctx, info) => ({ options: info.options }),
    ...overrides,
  }
}

/** Write a fake installed service package under `<dir>/node_modules`. */
function writeFakeServicePackage(dir: string, name: string, version: string): void {
  const pkgDir = join(dir, 'node_modules', ...name.split('/'))
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
    name,
    version,
    type: 'module',
    main: 'index.mjs',
  }))
  writeFileSync(join(pkgDir, 'index.mjs'), [
    `export default function createService() {`,
    `  return {`,
    `    package: ${JSON.stringify(name)},`,
    `    version: ${JSON.stringify(version)},`,
    `    scope: 'test:imported',`,
    `    setup: (_ctx, info) => ({ imported: true, options: info.options }),`,
    `  }`,
    `}`,
  ].join('\n'))
}

describe('wire services (install / ready barrier)', () => {
  it('queues installs and constructs once at the barrier with merged options', async () => {
    const { ctx } = await createCtx()
    const setup = vi.fn((_ctx: unknown, info: { options?: any }) => ({ options: info.options }))
    const def = defineTestService({ setup, options: { a: 1, b: 1 } })

    const first = ctx.services.install(def)
    // A second install of the same package contributes its options to the merge.
    const second = ctx.services.install({ package: '@test/svc', options: { b: 2, c: 3 } })

    expect(setup).not.toHaveBeenCalled()
    await ctx.services.ready()

    expect(setup).toHaveBeenCalledTimes(1)
    // Shallow merge in declaration order — later sets win.
    await expect(first).resolves.toEqual({ options: { a: 1, b: 2, c: 3 } })
    await expect(second).resolves.toEqual({ options: { a: 1, b: 2, c: 3 } })
    // The node API is provided under the package name.
    expect(ctx.services.get('@test/svc')).toEqual({ options: { a: 1, b: 2, c: 3 } })
  })

  it('uses the definition mergeOptions when declared', async () => {
    const { ctx } = await createCtx()
    const def = defineTestService({
      options: { langs: ['ts'] },
      mergeOptions: sets => ({ langs: sets.flatMap((s: any) => s.langs) }),
    })
    void ctx.services.install(def)
    void ctx.services.install({ package: '@test/svc', options: { langs: ['vue'] } })
    await ctx.services.ready()
    expect(ctx.services.get('@test/svc')).toEqual({ options: { langs: ['ts', 'vue'] } })
  })

  it('advertises installed services on the devframe:services shared state', async () => {
    const { ctx } = await createCtx()
    void ctx.services.install(defineTestService({ meta: { features: ['x'] } }))
    await ctx.services.ready()
    const state = await ctx.rpc.sharedState.get<DevframeServicesState>(DEVFRAME_SERVICES_STATE_KEY)
    expect(state.value()).toEqual({
      '@test/svc': { package: '@test/svc', version: '1.2.3', scope: 'test:svc', meta: { features: ['x'] } },
    })
  })

  it('creates an empty advertisement state at the barrier when nothing installs', async () => {
    const { ctx } = await createCtx()
    await ctx.services.ready()
    expect(ctx.rpc.sharedState.keys()).toContain(DEVFRAME_SERVICES_STATE_KEY)
  })

  it('setup receives a context scoped to the service namespace', async () => {
    const { ctx } = await createCtx()
    void ctx.services.install(defineTestService({
      setup: (scoped) => {
        scoped.rpc.register({ name: 'hello', handler: () => 'hi' })
        return {}
      },
    }))
    await ctx.services.ready()
    await expect((ctx.rpc.invokeLocal as (method: string) => Promise<unknown>)('test:svc:hello')).resolves.toBe('hi')
  })

  it('post-barrier installs construct immediately; duplicates warn and return the first API', async () => {
    const { ctx } = await createCtx()
    await ctx.services.ready()
    const api = await ctx.services.install(defineTestService({ options: { a: 1 } }))
    expect(api).toEqual({ options: { a: 1 } })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const again = await ctx.services.install(defineTestService({ options: { a: 2 } }))
    expect(again).toBe(api)
    expect(warn.mock.calls.flat().join('\n')).toContain('DF0066')
  })

  it('skips an optional descriptor whose package cannot be imported', async () => {
    const { ctx } = await createCtx()
    const install = ctx.services.install({ package: '@test/does-not-exist' })
    await ctx.services.ready()
    await expect(install).resolves.toBeUndefined()
    expect(ctx.services.has('@test/does-not-exist')).toBe(false)
  })

  it('rejects the barrier when a required descriptor cannot be imported', async () => {
    const { ctx } = await createCtx()
    void ctx.services.install({ package: '@test/does-not-exist', required: true })
    await expect(ctx.services.ready()).rejects.toThrowError(/Failed to import the required service package/)
  })

  it('imports a descriptor package relative to resolveFrom and installs its factory', async () => {
    const { ctx, dir } = await createCtx()
    writeFakeServicePackage(dir, '@test/imported-svc', '2.0.0')
    const install = ctx.services.install(
      { package: '@test/imported-svc', version: '^2', options: { x: 1 } },
      { resolveFrom: join(dir, '_resolver.js') },
    )
    await ctx.services.ready()
    await expect(install).resolves.toEqual({ imported: true, options: { x: 1 } })
    const state = await ctx.rpc.sharedState.get<DevframeServicesState>(DEVFRAME_SERVICES_STATE_KEY)
    expect(state.value()['@test/imported-svc']).toEqual({
      package: '@test/imported-svc',
      version: '2.0.0',
      scope: 'test:imported',
    })
  })

  it('throws on a required version-range mismatch, warns on an optional one', async () => {
    const { ctx, dir } = await createCtx()
    writeFakeServicePackage(dir, '@test/versioned-svc', '2.0.0')
    const resolveFrom = join(dir, '_resolver.js')

    void ctx.services.install({ package: '@test/versioned-svc', version: '^1', required: true }, { resolveFrom })
    await expect(ctx.services.ready()).rejects.toThrowError(/does not satisfy the required range/)

    // A fresh context: the optional mismatch installs anyway with a warning.
    const { ctx: ctx2 } = await createCtx()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const install = ctx2.services.install({ package: '@test/versioned-svc', version: '^1' }, { resolveFrom })
    await ctx2.services.ready()
    await expect(install).resolves.toEqual({ imported: true, options: undefined })
    expect(warn.mock.calls.flat().join('\n')).toContain('DF0069')
    expect(ctx2.services.has('@test/versioned-svc')).toBe(true)
  })

  it('rejects invalid inputs with DF0070', async () => {
    const { ctx } = await createCtx()
    expect(() => ctx.services.install({} as never)).toThrowError(/has no `package` name/)
    expect(() => ctx.services.install({ package: '@test/x', scope: '', version: '1.0.0', setup: () => ({}) })).toThrowError(/no RPC `scope` namespace/)
  })
})
