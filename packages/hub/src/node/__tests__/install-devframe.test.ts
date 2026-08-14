import type { DevframeConfigsHost, DevframeDefinition, DevframeDuplicationStrategy } from 'devframe/types'
import type { DevframeHubContext } from '../context'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineDevframe } from 'devframe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DevframeDocksHost } from '../host-docks'
import { installDevframe } from '../install-devframe'

/** Minimal stand-in for `createHostContext`'s real `DevframeConfigsHostImpl`. */
function createConfigsHost(): DevframeConfigsHost {
  const values: Record<string, any> = {}
  return {
    contribute: (key, updater) => {
      values[key] = updater(values[key])
    },
    resolve: () => values,
  }
}

function createContext(): DevframeHubContext {
  const storageDir = mkdtempSync(join(tmpdir(), 'devframe-hub-install-'))
  const context = {
    host: {
      mountStatic: () => {},
      resolveOrigin: () => 'http://localhost:5173',
      getStorageDir: () => storageDir,
    },
    views: {
      hostStatic: () => {},
    },
    configs: createConfigsHost(),
  } as unknown as DevframeHubContext
  context.docks = new DevframeDocksHost(context)
  // `createHubContext` wires this; the hand-built fake context here does the
  // same so the tests drive the public `ctx.install` surface.
  context.install = (devframe, options) => installDevframe(context, devframe, options)
  return context
}

function makeDevframe(
  overrides: Partial<DevframeDefinition> = {},
): DevframeDefinition {
  return defineDevframe({
    id: 'demo',
    name: 'Demo',
    version: '1.0.0',
    packageName: 'demo-devframe',
    homepage: 'https://example.test',
    description: 'A demo devframe.',
    setup: () => {},
    ...overrides,
  })
}

describe('ctx.install', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers an iframe dock derived from the definition and runs setup', async () => {
    const ctx = createContext()
    const setup = vi.fn()
    await ctx.install(makeDevframe({ setup }))

    expect(ctx.docks.views.size).toBe(1)
    const entry = ctx.docks.views.get('demo')
    expect(entry).toMatchObject({ id: 'demo', title: 'Demo', type: 'iframe', url: '/__demo/' })
    expect(setup).toHaveBeenCalledTimes(1)
  })

  it('applies the definition-level dock defaults to the synthesized entry', async () => {
    const ctx = createContext()
    await ctx.install(makeDevframe({
      dock: { category: 'framework', defaultOrder: 5, when: 'clientType == embedded' },
    }))

    expect(ctx.docks.views.get('demo')).toMatchObject({
      id: 'demo',
      title: 'Demo',
      type: 'iframe',
      category: 'framework',
      defaultOrder: 5,
      when: 'clientType == embedded',
    })
  })

  it('applies the definition-level dock `visibility` default to the synthesized entry, independent of `when`', async () => {
    const ctx = createContext()
    await ctx.install(makeDevframe({
      dock: { when: 'clientType == embedded', visibility: 'false' },
    }))

    expect(ctx.docks.views.get('demo')).toMatchObject({
      id: 'demo',
      when: 'clientType == embedded',
      visibility: 'false',
    })
  })

  it('lets per-mount dock overrides win over the definition dock defaults', async () => {
    const ctx = createContext()
    await ctx.install(makeDevframe({ dock: { category: 'framework', defaultOrder: 5 } }), { dock: { category: 'app' } })

    expect(ctx.docks.views.get('demo')).toMatchObject({
      category: 'app',
      defaultOrder: 5,
    })
  })

  it('contributes categoryOrder/maxVisibleItems/defaultMode/defaultPosition to ctx.configs instead of the entry', async () => {
    const ctx = createContext()
    await ctx.install(makeDevframe({
      dock: {
        category: 'app',
        categoryOrder: { app: -40 },
        maxVisibleItems: 4,
        defaultMode: 'edge',
        defaultPosition: 'left',
      },
    }))

    expect(ctx.configs.resolve().dock).toEqual({
      categoryOrder: { app: -40 },
      maxVisibleItems: 4,
      defaultMode: 'edge',
      defaultPosition: 'left',
    })
    // Not spread onto the synthesized entry — those aren't entry attributes.
    const entry = ctx.docks.views.get('demo') as unknown as Record<string, unknown>
    expect(entry.categoryOrder).toBeUndefined()
    expect(entry.maxVisibleItems).toBeUndefined()
    expect(entry.defaultMode).toBeUndefined()
    expect(entry.defaultPosition).toBeUndefined()
    expect(entry.category).toBe('app')
  })

  it('leaves ctx.configs untouched when a devframe declares no dock-bar preferences', async () => {
    const ctx = createContext()
    await ctx.install(makeDevframe({ dock: { category: 'app' } }))
    expect(ctx.configs.resolve().dock).toBeUndefined()
  })

  it('shallow-merges categoryOrder across two devframes, last wins per scalar field', async () => {
    const ctx = createContext()
    await ctx.install(makeDevframe({
      dock: { categoryOrder: { app: -40, web: 300 }, maxVisibleItems: 4, defaultMode: 'edge' },
    }))
    await ctx.install(makeDevframe({
      id: 'demo-2',
      dock: { categoryOrder: { app: -60, advanced: -50 }, maxVisibleItems: 10 },
    }))

    expect(ctx.configs.resolve().dock).toEqual({
      categoryOrder: { app: -60, web: 300, advanced: -50 },
      maxVisibleItems: 10,
      defaultMode: 'edge',
    })
  })

  it('warns and deduplicates by default, keeping the first registration', async () => {
    const ctx = createContext()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setup = vi.fn()

    await ctx.install(makeDevframe({ setup }))
    await ctx.install(makeDevframe({ setup, name: 'Demo Again' }))

    expect(ctx.docks.views.size).toBe(1)
    expect(ctx.docks.views.get('demo')).toMatchObject({ title: 'Demo' })
    expect(setup).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('deduplicates silently without warning', async () => {
    const ctx = createContext()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setup = vi.fn()
    const strategy: DevframeDuplicationStrategy = 'silent'

    await ctx.install(makeDevframe({ setup, duplicationStrategy: strategy }))
    await ctx.install(makeDevframe({ setup, duplicationStrategy: strategy }))

    expect(ctx.docks.views.size).toBe(1)
    expect(setup).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('throws on a duplicate when the strategy is "throw"', async () => {
    const ctx = createContext()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const def = makeDevframe({ duplicationStrategy: 'throw' })

    await ctx.install(def)
    await expect(ctx.install(def)).rejects.toThrow(/already mounted/)
    expect(ctx.docks.views.size).toBe(1)
  })

  it('serves connection meta at the mounted base when the host implements it', async () => {
    const ctx = createContext()
    const mountConnectionMeta = vi.fn()
    ;(ctx.host as { mountConnectionMeta?: unknown }).mountConnectionMeta = mountConnectionMeta
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await ctx.install(makeDevframe({ cli: { distDir: '/tmp/demo-dist' } }))

    expect(mountConnectionMeta).toHaveBeenCalledWith('/__demo/')
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns (DF8106) when a servable devframe is mounted on a host without mountConnectionMeta', async () => {
    const ctx = createContext()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await ctx.install(makeDevframe({ cli: { distDir: '/tmp/demo-dist' } }))

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0].join(' ')).toContain('DF8106')
  })

  it('lets instances coexist under disambiguated ids when "duplicate"', async () => {
    const ctx = createContext()
    const setup = vi.fn()

    await ctx.install(makeDevframe({ setup, duplicationStrategy: 'duplicate' }))
    await ctx.install(makeDevframe({ setup, duplicationStrategy: 'duplicate' }))
    await ctx.install(makeDevframe({ setup, duplicationStrategy: 'duplicate' }))

    expect([...ctx.docks.views.keys()]).toEqual(['demo', 'demo-2', 'demo-3'])
    expect(ctx.docks.views.get('demo-2')).toMatchObject({ type: 'iframe', url: '/__demo-2/' })
    expect(setup).toHaveBeenCalledTimes(3)
  })
})
