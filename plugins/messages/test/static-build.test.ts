import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import messagesDevframe from '@devframes/plugin-messages'
import { createBuild } from 'devframe/adapters/build'
import {
  DEVFRAME_CONNECTION_META_FILENAME,
  DEVFRAME_RPC_DUMP_MANIFEST_FILENAME,
} from 'devframe/constants'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertSpaBuilt } from './_utils'

describe('messages static build', () => {
  let outDir: string
  // Building on a plain context takes the warn-and-noop path by design.
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  beforeAll(async () => {
    assertSpaBuilt()
    outDir = await mkdtemp(path.join(os.tmpdir(), 'devframes-plugin-messages-build-'))
    await createBuild(messagesDevframe, { outDir })
  })

  afterAll(async () => {
    if (outDir)
      await rm(outDir, { recursive: true, force: true })
    warn.mockRestore()
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

  it('bakes the list snapshot into the dump manifest', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(outDir, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME), 'utf-8'),
    ) as Record<string, unknown>

    // The snapshot `query` bakes into the static dump; the mutating
    // `action` functions must not appear.
    expect(manifest['devframes-plugin-messages:list']).toBeTruthy()
    expect(manifest['devframes-plugin-messages:add']).toBeUndefined()
    expect(manifest['devframes-plugin-messages:clear']).toBeUndefined()
  })
})
