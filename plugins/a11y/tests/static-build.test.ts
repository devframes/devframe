import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createBuild } from 'devframe/adapters/build'
import {
  DEVFRAME_CONNECTION_META_FILENAME,
  DEVFRAME_RPC_DUMP_MANIFEST_FILENAME,
} from 'devframe/constants'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import devframe from '../src/index'
import { assertClientBuilt } from './_utils'

interface DumpManifest {
  [name: string]:
    | { type: 'static', path: string }
    | { type: 'query', records: Record<string, string>, fallback?: string }
}

describe('static build (CLI build surface)', () => {
  let outBuild: string

  beforeAll(async () => {
    assertClientBuilt()
    outBuild = await mkdtemp(path.join(os.tmpdir(), 'devframes_plugin_a11y-build-'))
  })

  afterAll(async () => {
    if (outBuild)
      await rm(outBuild, { recursive: true, force: true })
  })

  it('copies the SPA with relative asset URLs', async () => {
    await createBuild(devframe, { outDir: outBuild })
    const html = await readFile(path.join(outBuild, 'index.html'), 'utf-8')
    expect(html).toContain('<base href="./" />')
    expect(html).toMatch(/src="\.\/assets\/[^"]+\.js"/)
    expect(existsSync(path.join(outBuild, 'assets'))).toBe(true)
  })

  it('writes a static-backend connection meta next to index.html', async () => {
    const meta = JSON.parse(
      await readFile(path.join(outBuild, DEVFRAME_CONNECTION_META_FILENAME), 'utf-8'),
    ) as { backend: string }
    expect(meta).toMatchObject({ backend: 'static' })
    expect(existsSync(path.join(outBuild, '__devframe'))).toBe(false)
  })

  it('bakes get-config into the RPC dump', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(outBuild, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME), 'utf-8'),
    ) as DumpManifest

    const entry = manifest['devframes:plugin:a11y:get-config']
    expect(entry).toMatchObject({ type: 'static' })
    if (!('path' in entry))
      throw new Error('expected static manifest entry')

    const record = JSON.parse(
      await readFile(path.join(outBuild, entry.path), 'utf-8'),
    ) as { output: { channel: string, impacts: { id: string }[] } }
    expect(record.output.channel).toBe('devframes:plugin:a11y')
    expect(record.output.impacts.map(i => i.id)).toEqual(['critical', 'serious', 'moderate', 'minor'])
  })
})
