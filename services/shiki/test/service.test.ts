import type { DevframeHost } from 'devframe/types'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostContext } from 'devframe/node'
import { afterEach, describe, expect, it } from 'vitest'
import { createShikiService, SHIKI_DEFAULT_THEMES } from '../src/index'

const tempDirs: string[] = []

afterEach(() => {
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

async function createService(options?: Parameters<typeof createShikiService>[0]) {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-service-shiki-'))
  tempDirs.push(dir)
  const ctx = await createHostContext({ cwd: dir, mode: 'dev', host: createTestHost(dir) })
  const install = ctx.services.install(createShikiService(options))
  await ctx.services.ready()
  return { ctx, api: (await install)! }
}

describe('@devframes/service-shiki', () => {
  it('highlights with dual light/dark themes by default', async () => {
    const { ctx, api } = await createService()
    const { html } = await api.highlight({ code: 'const a = 1', lang: 'ts' })
    expect(html).toContain('<pre')
    expect(html).toContain('shiki')
    // Dual-theme output carries the dark values as CSS variables.
    expect(html).toContain('--shiki-dark')

    // The same surface is reachable over scoped RPC.
    const viaRpc = await (ctx.rpc.invokeLocal as (m: string, ...args: unknown[]) => Promise<{ html: string }>)(
      'devframes:service:shiki:highlight',
      { code: 'const a = 1', lang: 'ts' },
    )
    expect(viaRpc.html).toBe(html)
  })

  it('degrades unknown languages to plain text instead of throwing', async () => {
    const { api } = await createService()
    const { html } = await api.highlight({ code: 'hello world', lang: 'not-a-language' })
    expect(html).toContain('hello world')
  })

  it('serves tokens and hast for renderers that own their DOM', async () => {
    const { api } = await createService()
    const tokens = await api.codeToTokens({ code: 'const a = 1', lang: 'ts' })
    expect(tokens.tokens.length).toBeGreaterThan(0)
    const hast = await api.codeToHast({ code: 'const a = 1', lang: 'ts' })
    expect(hast.children.length).toBeGreaterThan(0)
  })

  it('caches per (code, lang, themes)', async () => {
    const { api } = await createService()
    const first = api.highlight({ code: 'let x = 2', lang: 'ts' })
    const second = api.highlight({ code: 'let x = 2', lang: 'ts' })
    expect(second).toBe(first) // same cached promise
    const other = api.highlight({ code: 'let x = 2', lang: 'ts', themes: { light: 'github-light', dark: 'github-dark' } })
    expect(other).not.toBe(first)
    await expect(other).resolves.toHaveProperty('html')
  })

  it('merges options: later themes win, langs union', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devframe-service-shiki-'))
    tempDirs.push(dir)
    const ctx = await createHostContext({ cwd: dir, mode: 'dev', host: createTestHost(dir) })
    void ctx.services.install(createShikiService({ langs: ['ts'] }))
    void ctx.services.install({
      package: '@devframes/service-shiki',
      options: { langs: ['vue'], themes: SHIKI_DEFAULT_THEMES },
    })
    await ctx.services.ready()
    const api = ctx.services.get('@devframes/service-shiki')
    const { html } = await api!.highlight({ code: 'const a = 1', lang: 'ts' })
    expect(html).toContain('--shiki-dark')
  })
})
