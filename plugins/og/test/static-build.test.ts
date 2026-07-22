import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createOgDevframe } from '@devframes/plugin-og'
import { createBuild } from 'devframe/adapters/build'
import { DEVFRAME_RPC_DUMP_MANIFEST_FILENAME } from 'devframe/constants'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertSpaBuilt, testFetch } from './_utils'

it('requires standalone trust by default', () => {
  expect(createOgDevframe().cli?.auth).toBe(true)
})

it('requires a default URL for static reports', async () => {
  const emptyOutDir = await mkdtemp(path.join(os.tmpdir(), 'devframes_plugin_og-empty-build-'))
  await expect(createBuild(createOgDevframe(), { outDir: emptyOutDir })).rejects.toThrow(/requires a default URL/)
  await rm(emptyOutDir, { recursive: true, force: true })
})

describe('open Graph static build', () => {
  let outDir: string

  beforeAll(async () => {
    assertSpaBuilt()
    outDir = await mkdtemp(path.join(os.tmpdir(), 'devframes_plugin_og-build-'))
    const definition = createOgDevframe({ defaultUrl: 'https://example.com/report', fetch: testFetch })
    await createBuild(definition, { outDir })
  })

  afterAll(async () => {
    if (outDir)
      await rm(outDir, { recursive: true, force: true })
  })

  it('copies the Vue SPA and query loader metadata', async () => {
    const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
    const loader = JSON.parse(await readFile(path.join(outDir, 'spa-loader.json'), 'utf8'))
    expect(html).toContain('<base href="./" />')
    expect(html).toMatch(/src="\.\/assets\/[^"?]+\.js"/)
    expect(loader).toMatchObject({ mode: 'query' })
  })

  it('bakes the default target into the RPC dump', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(outDir, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME), 'utf8'),
    ) as Record<string, { records: unknown[] }>
    expect(manifest['devframes:plugin:og:resolve-metadata']).toBeTruthy()
  })
})
