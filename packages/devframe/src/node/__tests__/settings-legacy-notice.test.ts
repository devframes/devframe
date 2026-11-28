import type { DevframeHost } from '../../types/host'
import type { DevframeHostLegacyStorage } from '../legacy-storage'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createHostContext } from '../context'
import { resolveLegacyStorageDir } from '../legacy-storage'

function storageHost(root: string, legacy?: string): DevframeHost {
  return {
    mountStatic: () => { /* no-op */ },
    resolveOrigin: () => 'http://localhost:0',
    getStorageDir: (scope: string) => join(root, scope),
    ...(legacy
      ? {
          getLegacyStorageDir: (scope: string) => join(legacy, scope),
        }
      : {}),
  } as DevframeHost
}

async function contextWith(root: string) {
  return createHostContext({
    cwd: root,
    mode: 'dev',
    host: storageHost(root),
  })
}

function writeGlobalSettings(root: string, namespace: string, value: Record<string, unknown>): void {
  const dir = join(root, 'global', 'settings')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${namespace}.json`), JSON.stringify(value))
}

describe('shared-scope settings notice', () => {
  it('lists the namespaces that already hold a global settings file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'devframe-settings-notice-'))
    writeGlobalSettings(root, 'data-inspector', { theme: 'dark' })
    writeGlobalSettings(root, 'json-render', {})

    const ctx = await contextWith(root)
    const notice = await ctx.rpc.invokeLocal('devframe:settings:legacy-notice')
    expect(notice).toEqual({
      namespaces: ['data-inspector', 'json-render'],
    })
  })

  it('reports nothing when the machine never wrote a settings file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'devframe-settings-notice-'))
    const ctx = await contextWith(root)
    expect(await ctx.rpc.invokeLocal('devframe:settings:legacy-notice')).toEqual({ namespaces: [] })
  })

  it('keeps the notice dismissed after the marker is written', async () => {
    const root = mkdtempSync(join(tmpdir(), 'devframe-settings-notice-'))
    writeGlobalSettings(root, 'data-inspector', { theme: 'dark' })

    const ctx = await contextWith(root)
    await ctx.rpc.invokeLocal('devframe:settings:legacy-notice-dismiss')
    expect(existsSync(join(root, 'global', 'settings', '.shared-scope-notice'))).toBe(true)
    expect(await ctx.rpc.invokeLocal('devframe:settings:legacy-notice')).toEqual({ namespaces: [] })

    // A later start on the same machine reads the marker, not the notice.
    const restarted = await contextWith(root)
    expect(await restarted.rpc.invokeLocal('devframe:settings:legacy-notice')).toEqual({ namespaces: [] })
  })
})

describe('resolveLegacyStorageDir', () => {
  it('returns undefined for a host without the optional capability', () => {
    expect(resolveLegacyStorageDir(storageHost('/root'), 'project')).toBeUndefined()
  })

  it('reads the legacy directory a host exposes', () => {
    expect(resolveLegacyStorageDir(storageHost('/root', '/legacy'), 'project')).toBe('/legacy/project')
  })

  it('treats a throwing or non-string host method as no legacy data', () => {
    const throwing: DevframeHost & DevframeHostLegacyStorage = {
      ...storageHost('/root'),
      getLegacyStorageDir: () => {
        throw new Error('unsupported scope')
      },
    }
    expect(resolveLegacyStorageDir(throwing, 'project')).toBeUndefined()
    const empty: DevframeHost & DevframeHostLegacyStorage = {
      ...storageHost('/root'),
      getLegacyStorageDir: () => '',
    }
    expect(resolveLegacyStorageDir(empty, 'project')).toBeUndefined()
  })
})
