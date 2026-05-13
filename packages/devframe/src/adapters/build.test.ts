import type { DevframeDefinition } from '../types/devframe'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { resolve } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBuild } from './build'

// Minimal stub definition
function stubDefinition(overrides: Partial<DevframeDefinition> = {}): DevframeDefinition {
  return {
    id: 'test-devframe',
    setup: vi.fn(async () => {}),
    cli: { distDir: '/tmp/test-spa-dist' },
    ...overrides,
  } as any
}

describe('createBuild', () => {
  const outDir = resolve('/tmp/devframe-build-test-out')
  const distDir = resolve('/tmp/test-spa-dist')

  beforeEach(async () => {
    // Create a fake SPA dist directory with an index.html
    await fs.mkdir(distDir, { recursive: true })
    await fs.writeFile(resolve(distDir, 'index.html'), '<html></html>')
  })

  afterEach(async () => {
    await fs.rm(outDir, { recursive: true, force: true })
    await fs.rm(distDir, { recursive: true, force: true })
  })

  it('throws when no distDir is provided', async () => {
    const d = stubDefinition({ cli: undefined })
    await expect(createBuild(d, { outDir })).rejects.toThrow('no distDir')
  })

  it('creates output directory', async () => {
    const d = stubDefinition()
    await createBuild(d, { outDir, distDir })
    expect(existsSync(outDir)).toBe(true)
  })

  it('copies SPA dist into outDir', async () => {
    const d = stubDefinition()
    await createBuild(d, { outDir, distDir })
    expect(existsSync(resolve(outDir, 'index.html'))).toBe(true)
  })

  it('writes __connection.json with backend: static', async () => {
    const d = stubDefinition()
    await createBuild(d, { outDir, distDir })
    const meta = JSON.parse(await fs.readFile(resolve(outDir, '__connection.json'), 'utf-8'))
    expect(meta.backend).toBe('static')
  })

  it('creates __rpc-dump directory', async () => {
    const d = stubDefinition()
    await createBuild(d, { outDir, distDir })
    expect(existsSync(resolve(outDir, '__rpc-dump'))).toBe(true)
  })

  it('writes __rpc-dump/index.json manifest', async () => {
    const d = stubDefinition()
    await createBuild(d, { outDir, distDir })
    expect(existsSync(resolve(outDir, '__rpc-dump/index.json'))).toBe(true)
  })

  it('writes spa-loader.json when d.spa is defined', async () => {
    const d = stubDefinition({ spa: { loader: 'query' } } as any)
    await createBuild(d, { outDir, distDir, base: '/app/' })
    const loader = JSON.parse(await fs.readFile(resolve(outDir, 'spa-loader.json'), 'utf-8'))
    expect(loader.version).toBe(1)
    expect(loader.mode).toBe('query')
    expect(loader.base).toBe('/app/')
  })

  it('does not write spa-loader.json when d.spa is undefined', async () => {
    const d = stubDefinition()
    await createBuild(d, { outDir, distDir })
    expect(existsSync(resolve(outDir, 'spa-loader.json'))).toBe(false)
  })

  it('removes existing outDir before building', async () => {
    await fs.mkdir(outDir, { recursive: true })
    await fs.writeFile(resolve(outDir, 'stale.txt'), 'old')
    const d = stubDefinition()
    await createBuild(d, { outDir, distDir })
    expect(existsSync(resolve(outDir, 'stale.txt'))).toBe(false)
  })

  it('calls d.setup with build mode context', async () => {
    const setup = vi.fn(async () => {})
    const d = stubDefinition({ setup })
    await createBuild(d, { outDir, distDir })
    expect(setup).toHaveBeenCalledOnce()
  })
})
