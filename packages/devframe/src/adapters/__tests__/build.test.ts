import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineDevframe } from 'devframe'
import { describe, expect, it } from 'vitest'
import { createBuild } from '../build'

function makeTmpDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-build-test-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>test</title>', 'utf-8')
  return dir
}

function baseDevframe(overrides: Partial<ReturnType<typeof defineDevframe>> = {}) {
  const distDir = makeTmpDist()
  return defineDevframe({
    id: 'devframe-build-test',
    name: 'Devframe Build Test',
    version: '0.0.0',
    packageName: 'devframe-build-test',
    homepage: 'https://example.test',
    description: 'Test devframe.',
    cli: { distDir },
    setup: () => {},
    ...overrides,
  })
}

describe('adapters/build', () => {
  it('rejects a definition with capabilities.build: false by default', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'devframe-build-test-out-'))
    try {
      await expect(
        createBuild(baseDevframe({ capabilities: { build: false } }), { outDir }),
      ).rejects.toThrow(/capabilities\.build: false/)
    }
    finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('proceeds past capabilities.build: false when force is set', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'devframe-build-test-out-'))
    try {
      await expect(
        createBuild(baseDevframe({ capabilities: { build: false } }), { outDir, force: true }),
      ).resolves.toBeUndefined()
    }
    finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('proceeds normally when capabilities.build is unset', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'devframe-build-test-out-'))
    try {
      await expect(createBuild(baseDevframe(), { outDir })).resolves.toBeUndefined()
    }
    finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
