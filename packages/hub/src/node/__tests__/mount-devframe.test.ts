import type { DevframeDefinition, DevframeDuplicationStrategy } from 'devframe/types'
import type { DevframeHubContext } from '../context'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineDevframe } from 'devframe/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DevframeDocksHost } from '../host-docks'
import { mountDevframe } from '../mount-devframe'

function createContext(): DevframeHubContext {
  const storageDir = mkdtempSync(join(tmpdir(), 'devframe-hub-mount-'))
  const context = {
    host: {
      mountStatic: () => {},
      resolveOrigin: () => 'http://localhost:5173',
      getStorageDir: () => storageDir,
    },
    views: {
      hostStatic: () => {},
    },
  } as unknown as DevframeHubContext
  context.docks = new DevframeDocksHost(context)
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

describe('mountDevframe', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers an iframe dock derived from the definition and runs setup', async () => {
    const ctx = createContext()
    const setup = vi.fn()
    await mountDevframe(ctx, makeDevframe({ setup }))

    expect(ctx.docks.views.size).toBe(1)
    const entry = ctx.docks.views.get('demo')
    expect(entry).toMatchObject({ id: 'demo', title: 'Demo', type: 'iframe', url: '/__demo/' })
    expect(setup).toHaveBeenCalledTimes(1)
  })

  it('warns and deduplicates by default, keeping the first registration', async () => {
    const ctx = createContext()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setup = vi.fn()

    await mountDevframe(ctx, makeDevframe({ setup }))
    await mountDevframe(ctx, makeDevframe({ setup, name: 'Demo Again' }))

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

    await mountDevframe(ctx, makeDevframe({ setup, duplicationStrategy: strategy }))
    await mountDevframe(ctx, makeDevframe({ setup, duplicationStrategy: strategy }))

    expect(ctx.docks.views.size).toBe(1)
    expect(setup).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('throws on a duplicate when the strategy is "throw"', async () => {
    const ctx = createContext()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const def = makeDevframe({ duplicationStrategy: 'throw' })

    await mountDevframe(ctx, def)
    await expect(mountDevframe(ctx, def)).rejects.toThrow(/already mounted/)
    expect(ctx.docks.views.size).toBe(1)
  })

  it('flows a function `when` through the `options.dock` spread and re-resolves it per values() call', async () => {
    const ctx = createContext()
    let hidden = false

    await mountDevframe(ctx, makeDevframe(), {
      dock: { when: () => (hidden ? 'false' : undefined) },
    })

    expect(ctx.docks.values({ includeBuiltin: false })[0].when).toBeUndefined()

    hidden = true
    expect(ctx.docks.values({ includeBuiltin: false })[0].when).toBe('false')
  })

  it('lets instances coexist under disambiguated ids when "duplicate"', async () => {
    const ctx = createContext()
    const setup = vi.fn()

    await mountDevframe(ctx, makeDevframe({ setup, duplicationStrategy: 'duplicate' }))
    await mountDevframe(ctx, makeDevframe({ setup, duplicationStrategy: 'duplicate' }))
    await mountDevframe(ctx, makeDevframe({ setup, duplicationStrategy: 'duplicate' }))

    expect([...ctx.docks.views.keys()]).toEqual(['demo', 'demo-2', 'demo-3'])
    expect(ctx.docks.views.get('demo-2')).toMatchObject({ type: 'iframe', url: '/__demo-2/' })
    expect(setup).toHaveBeenCalledTimes(3)
  })
})
