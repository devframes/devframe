import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineDevframe } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
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
    clientAssets: distDir,
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

  it('bakes rpc.snapshot methods a devframe does not own into the dump', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'devframe-build-test-out-'))
    // A dump-less query RPC (as a wire service would register) that the
    // devframe opts into baking via `rpc.snapshot` — string (no-arg), static
    // inputs, and an async provider.
    const def = baseDevframe({
      setup: (ctx) => {
        ctx.rpc.register({ name: 'demo:ping', type: 'query', jsonSerializable: true, handler: () => 'pong' })
        ctx.rpc.register({
          name: 'demo:echo',
          type: 'query',
          jsonSerializable: true,
          args: [s.object({ value: s.string() })],
          returns: s.object({ value: s.string() }),
          handler: (input: { value: string }) => input,
        })
      },
      rpc: {
        snapshot: [
          'demo:ping',
          { method: 'demo:echo', inputs: [[{ value: 'a' }]] },
          { method: 'demo:echo', inputs: async () => [[{ value: 'b' }]] },
        ],
      },
    })
    try {
      await createBuild(def, { outDir })
      const manifest = JSON.parse(readFileSync(join(outDir, '__rpc-dump/index.json'), 'utf-8'))
      // `demo:ping` baked its no-arg call + fallback (string form).
      expect(manifest['demo:ping']?.type).toBe('query')
      expect(manifest['demo:ping'].fallback).toBeTruthy()
      // `demo:echo` baked a record per provided tuple (static + provider merged
      // — the last rpc.snapshot entry for a method wins).
      expect(manifest['demo:echo']?.type).toBe('query')
      expect(Object.keys(manifest['demo:echo'].records).length).toBeGreaterThanOrEqual(1)
    }
    finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('warns (DF0072) when rpc.snapshot names an unregistered method', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'devframe-build-test-out-'))
    try {
      // Does not throw — a missing target is a warning, the build proceeds.
      await expect(
        createBuild(baseDevframe({ rpc: { snapshot: ['does:not:exist'] } }), { outDir }),
      ).resolves.toBeUndefined()
    }
    finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
