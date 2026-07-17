import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import inspectDevframe from '@devframes/plugin-inspect'
import { createBuild } from 'devframe/adapters/build'
import {
  DEVFRAME_CONNECTION_META_FILENAME,
  DEVFRAME_RPC_DUMP_MANIFEST_FILENAME,
} from 'devframe/constants'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertSpaBuilt } from './_utils'

describe('inspector static build', () => {
  let outDir: string

  beforeAll(async () => {
    assertSpaBuilt()
    outDir = await mkdtemp(path.join(os.tmpdir(), 'devframes_plugin_inspect-build-'))
    await createBuild(inspectDevframe, { outDir })
  })

  afterAll(async () => {
    if (outDir)
      await rm(outDir, { recursive: true, force: true })
  })

  it('copies the SPA with relative asset URLs', async () => {
    const html = await readFile(path.join(outDir, 'index.html'), 'utf-8')
    expect(html).toContain('<base href="./" />')
    expect(html).toMatch(/src="\.\/assets\/[^"]+\.js"/)
  })

  it('writes a static-backend connection meta next to index.html', async () => {
    const meta = JSON.parse(
      await readFile(path.join(outDir, DEVFRAME_CONNECTION_META_FILENAME), 'utf-8'),
    ) as { backend: string }
    expect(meta).toMatchObject({ backend: 'static' })
  })

  it('bakes the snapshot query functions into the dump manifest', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(outDir, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME), 'utf-8'),
    ) as Record<string, unknown>

    // `invoke` is an `action` with no dump — it must not appear.
    expect(manifest['devframes:plugin:inspect:invoke']).toBeUndefined()
    // The three snapshot `query` functions bake into the static dump.
    expect(manifest['devframes:plugin:inspect:list-functions']).toBeTruthy()
    expect(manifest['devframes:plugin:inspect:list-state-keys']).toBeTruthy()
    expect(manifest['devframes:plugin:inspect:describe-agent']).toBeTruthy()
  })
})
