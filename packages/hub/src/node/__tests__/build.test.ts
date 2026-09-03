import type { DevframeDefinition, DevframeNodeContext } from 'devframe/types'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HUB_EVENTS } from '../../events'
import { buildHub } from '../build'

function makeDist(html: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'hub-build-dist-'))
  writeFileSync(join(dir, 'index.html'), html, 'utf-8')
  return dir
}

function makePageScript(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hub-build-script-'))
  writeFileSync(join(dir, 'inject.js'), 'export default () => {}\n', 'utf-8')
  return join(dir, 'inject.js')
}

function makeFrame(id: string, options: { distDir?: string, clientScript?: string } = {}): DevframeDefinition {
  return {
    id,
    name: `Frame ${id}`,
    version: '0.0.0',
    packageName: `@test/${id}`,
    homepage: '',
    description: '',
    ...(options.distDir ? { clientAssets: options.distDir } : {}),
    ...(options.clientScript ? { dock: { clientScript: { importFrom: options.clientScript } } } : {}),
    setup(ctx: DevframeNodeContext) {
      ctx.rpc.register({
        name: `${id}:probe`,
        type: 'static',
        jsonSerializable: true,
        handler: () => `ok:${id}`,
      })
    },
  }
}

describe('buildHub', () => {
  it('bakes a self-contained static hub: SPAs, page scripts, metas, and the RPC dump', async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), 'hub-build-out-')), 'hub')
    const pageScript = makePageScript()

    await buildHub({
      outDir,
      base: '/__hub/',
      cwd: mkdtempSync(join(tmpdir(), 'hub-build-cwd-')),
      devframes: [
        makeFrame('alpha', { distDir: makeDist('<h1>alpha</h1>'), clientScript: pageScript }),
        makeFrame('beta', { distDir: makeDist('<h1>beta</h1>') }),
      ],
    })

    // Each SPA copied verbatim, the page script served under its frame base.
    expect(readFileSync(join(outDir, 'alpha/index.html'), 'utf-8')).toContain('alpha')
    expect(existsSync(join(outDir, 'alpha/__page-script/inject.js'))).toBe(true)
    expect(readFileSync(join(outDir, 'beta/index.html'), 'utf-8')).toContain('beta')

    // Hub meta is static; per-frame metas point back at the hub's own meta.
    const hubMeta = JSON.parse(readFileSync(join(outDir, '__connection.json'), 'utf-8'))
    expect(hubMeta.backend).toBe('static')
    const frameMeta = JSON.parse(readFileSync(join(outDir, 'alpha/__connection.json'), 'utf-8'))
    expect(frameMeta.baseUrl).toBe('/__hub/__connection.json')

    // The dump bakes each devframe's static RPC and the shared-state
    // snapshots (docks with the rewritten page-script URL among them).
    const manifest = JSON.parse(readFileSync(join(outDir, '__rpc-dump/index.json'), 'utf-8'))
    expect(manifest['alpha:probe']).toMatchObject({ type: 'static' })
    const stateEntry = manifest['devframe:rpc:server-state:get']
    expect(stateEntry.type).toBe('query')
    const recordFiles = Object.values(stateEntry.records) as string[]
    const records = recordFiles.map(path => readFileSync(join(outDir, path), 'utf-8'))
    const docksRecord = records.find(text => text.includes(HUB_EVENTS.sharedState.docks))
    expect(docksRecord).toContain('/__hub/alpha/__page-script/inject.js')

    // Discovery documents.
    const index = JSON.parse(readFileSync(join(outDir, '__index.json'), 'utf-8'))
    expect(index.frames.map((frame: { id: string }) => frame.id)).toEqual(['alpha', 'beta'])
    expect(readFileSync(join(outDir, '__client-imports.js'), 'utf-8')).toContain('/__hub/alpha/__page-script/inject.js')
  })

  it('rejects a mount base outside the hub base', async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), 'hub-build-out-')), 'hub')
    await expect(buildHub({
      outDir,
      base: '/__hub/',
      cwd: mkdtempSync(join(tmpdir(), 'hub-build-cwd-')),
      async configure(ctx) {
        await ctx.install(makeFrame('gamma', { distDir: makeDist('<h1>gamma</h1>') }), { base: '/elsewhere/' })
      },
    })).rejects.toThrow(/escapes "\/__hub\/"/)
  })
})
