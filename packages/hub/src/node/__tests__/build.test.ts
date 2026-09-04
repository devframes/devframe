import type { DevframeDefinition, DevframeNodeContext } from 'devframe/types'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createH3DevframeHost } from 'devframe/internal'
import { describe, expect, it } from 'vitest'
import { HUB_EVENTS } from '../../events'
import { buildHub } from '../build'
import { createHubContext } from '../context'

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

  it('skips a devframe declaring capabilities.build: false', async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), 'hub-build-out-')), 'hub')
    const live: DevframeDefinition = {
      ...makeFrame('live', { distDir: makeDist('<h1>live</h1>') }),
      capabilities: { build: false },
    }

    await buildHub({
      outDir,
      base: '/__hub/',
      cwd: mkdtempSync(join(tmpdir(), 'hub-build-cwd-')),
      devframes: [makeFrame('alpha', { distDir: makeDist('<h1>alpha</h1>') }), live],
    })

    // Nothing of the skipped devframe lands in the output: no SPA, no frame
    // entry, no RPCs in the dump, no dock in the baked shared state.
    expect(existsSync(join(outDir, 'live'))).toBe(false)
    const index = JSON.parse(readFileSync(join(outDir, '__index.json'), 'utf-8'))
    expect(index.frames.map((frame: { id: string }) => frame.id)).toEqual(['alpha'])
    const manifest = JSON.parse(readFileSync(join(outDir, '__rpc-dump/index.json'), 'utf-8'))
    expect(manifest['live:probe']).toBeUndefined()
    const stateEntry = manifest['devframe:rpc:server-state:get']
    const records = (Object.values(stateEntry.records) as string[])
      .map(path => readFileSync(join(outDir, path), 'utf-8'))
    const docksRecord = records.find(text => text.includes(HUB_EVENTS.sharedState.docks))
    expect(docksRecord).toContain('alpha')
    expect(docksRecord).not.toContain('Frame live')
  })

  it('keeps sibling output when clean is false', async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), 'hub-build-out-')), 'hub')
    const appFile = join(outDir, 'app.js')

    await buildHub({
      outDir,
      base: '/__hub/',
      cwd: mkdtempSync(join(tmpdir(), 'hub-build-cwd-')),
      devframes: [makeFrame('alpha', { distDir: makeDist('<h1>alpha</h1>') })],
    })
    writeFileSync(appFile, 'app', 'utf-8')

    await buildHub({
      outDir,
      base: '/__hub/',
      clean: false,
      cwd: mkdtempSync(join(tmpdir(), 'hub-build-cwd-')),
      devframes: [makeFrame('beta', { distDir: makeDist('<h1>beta</h1>') })],
    })

    // The pre-existing sibling file survives, and the re-bake lands beside it.
    expect(existsSync(appFile)).toBe(true)
    expect(readFileSync(join(outDir, 'beta/index.html'), 'utf-8')).toContain('beta')
  })

  it('bakes an externally-mounted context passed as `context`', async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), 'hub-ctx-out-')), 'hub')
    const cwd = mkdtempSync(join(tmpdir(), 'hub-ctx-cwd-'))

    // A host assembling the context itself: create + mount via `ctx.install`,
    // then hand the already-mounted context to `buildHub`.
    const host = createH3DevframeHost({ origin: 'http://localhost', appName: 'devframes', workspaceRoot: cwd, mount: () => {} })
    const ctx = await createHubContext({ cwd, workspaceRoot: cwd, mode: 'build', host })
    await ctx.install(makeFrame('alpha', { distDir: makeDist('<h1>alpha</h1>') }), { base: '/__hub/alpha/' })

    expect(ctx.frames.map(frame => frame.id)).toEqual(['alpha'])

    await buildHub({ context: ctx, outDir, base: '/__hub/' })

    // The SPA was copied from `ctx.views.buildStaticDirs`, the index written
    // from `ctx.frames`, and the per-frame meta + shared dump emitted.
    expect(readFileSync(join(outDir, 'alpha/index.html'), 'utf-8')).toContain('alpha')
    const index = JSON.parse(readFileSync(join(outDir, '__index.json'), 'utf-8'))
    expect(index.frames.map((frame: { id: string }) => frame.id)).toEqual(['alpha'])
    const frameMeta = JSON.parse(readFileSync(join(outDir, 'alpha/__connection.json'), 'utf-8'))
    expect(frameMeta.baseUrl).toBe('/__hub/__connection.json')
    const manifest = JSON.parse(readFileSync(join(outDir, '__rpc-dump/index.json'), 'utf-8'))
    expect(manifest['alpha:probe']).toMatchObject({ type: 'static' })
  })

  it('bakes a sibling-layout context with deployBase mapping outDir to the deploy root', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'hub-deploy-out-'))
    const cwd = mkdtempSync(join(tmpdir(), 'hub-deploy-cwd-'))

    // Vite-DevTools shape: hub at /__devtools/, devframes at their own
    // top-level bases (siblings of the hub base under the deploy root).
    const host = createH3DevframeHost({ origin: 'http://localhost', appName: 'devframes', workspaceRoot: cwd, mount: () => {} })
    const ctx = await createHubContext({ cwd, workspaceRoot: cwd, mode: 'build', host })
    await ctx.install(makeFrame('inspect', { distDir: makeDist('<h1>inspect</h1>') }), { base: '/__inspect/' })

    await buildHub({ context: ctx, outDir, base: '/__devtools/', deployBase: '/', clean: false })

    // Hub artifacts land under the hub base; the sibling frame beside it.
    expect(existsSync(join(outDir, '__devtools/__connection.json'))).toBe(true)
    expect(existsSync(join(outDir, '__devtools/__index.json'))).toBe(true)
    expect(existsSync(join(outDir, '__devtools/__rpc-dump/index.json'))).toBe(true)
    expect(readFileSync(join(outDir, '__inspect/index.html'), 'utf-8')).toContain('inspect')

    // The frame meta points back at the hub's own meta at the hub base.
    const frameMeta = JSON.parse(readFileSync(join(outDir, '__inspect/__connection.json'), 'utf-8'))
    expect(frameMeta.baseUrl).toBe('/__devtools/__connection.json')
    const index = JSON.parse(readFileSync(join(outDir, '__devtools/__index.json'), 'utf-8'))
    expect(index.frames.map((frame: { id: string }) => frame.id)).toEqual(['inspect'])
  })

  it('rejects a hub base outside its deployBase', async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), 'hub-build-out-')), 'hub')
    await expect(buildHub({
      outDir,
      base: '/__hub/',
      deployBase: '/elsewhere/',
      cwd: mkdtempSync(join(tmpdir(), 'hub-build-cwd-')),
      devframes: [makeFrame('alpha', { distDir: makeDist('<h1>alpha</h1>') })],
    })).rejects.toThrow(/outside the deploy root/)
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
