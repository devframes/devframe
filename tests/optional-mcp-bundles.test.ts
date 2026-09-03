import type { Plugin } from 'esbuild'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const entries = [
  'packages/devframe/dist/adapters/cac.mjs',
  'packages/devframe/dist/adapters/initiate.mjs',
  'packages/hub/dist/node/initiate.mjs',
  'packages/next/dist/hub.mjs',
]
const nextServerChunks = join(root, 'examples/hub-next/src/client/.next/server/chunks')
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe('the MCP SDK stays out of consumer bundles', () => {
  it.each(entries)('bundles %s without resolving the MCP SDK', async (entry) => {
    const resolvedMcpImports: string[] = []
    const rejectMcpSdk: Plugin = {
      name: 'reject-mcp-sdk',
      setup(context) {
        context.onResolve({ filter: /^@modelcontextprotocol\// }, (args) => {
          resolvedMcpImports.push(args.path)
          return { errors: [{ text: `Unexpected MCP SDK import: ${args.path}` }] }
        })
      },
    }

    await build({
      entryPoints: [join(root, entry)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      plugins: [rejectMcpSdk],
      write: false,
    })

    expect(resolvedMcpImports).toEqual([])
  })

  it('loads the MCP adapter when an MCP-enabled hub bundle starts', async () => {
    const hubDist = join(root, 'packages/hub/dist')
    const outputDirectory = mkdtempSync(join(hubDist, '.mcp-bundle-test-'))
    temporaryDirectories.push(outputDirectory)
    const outfile = join(outputDirectory, 'hub.mjs')

    await build({
      entryPoints: [join(hubDist, 'node/initiate.mjs')],
      bundle: true,
      format: 'esm',
      outfile,
      platform: 'node',
    })

    const bundled = await import(pathToFileURL(outfile).href) as typeof import('../packages/hub/src/node/initiate')
    const hub = bundled.initHub({
      auth: false,
      base: bundled.DEVFRAMES_HUB_BASE,
      mcp: true,
      ws: false,
    })

    try {
      await hub.ready
      expect(hub.connectionMeta().mcp).toEqual({ path: '__mcp' })

      const origin = 'http://localhost:3000'
      const response = await hub.handler(new Request(`${origin}/__devframes/__mcp`, {
        method: 'POST',
        headers: {
          'accept': 'application/json, text/event-stream',
          'content-type': 'application/json',
          origin,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            capabilities: {},
            clientInfo: { name: 'bundle-test', version: '0' },
            protocolVersion: '2025-03-26',
          },
        }),
      }))

      // A 2025-era `initialize` is served statelessly through the SDK's
      // default legacy path, answered per request with no `Mcp-Session-Id`.
      expect(response.status).toBe(200)
      expect(response.headers.get('mcp-session-id')).toBeNull()
      await response.body?.cancel()
    }
    finally {
      await hub.close()
    }
  })

  it('mounts nothing under the `auto` default when the agent surface is empty', async () => {
    const hubDist = join(root, 'packages/hub/dist')
    const outputDirectory = mkdtempSync(join(hubDist, '.mcp-bundle-test-'))
    temporaryDirectories.push(outputDirectory)
    const outfile = join(outputDirectory, 'hub-auto.mjs')

    await build({
      entryPoints: [join(hubDist, 'node/initiate.mjs')],
      bundle: true,
      format: 'esm',
      outfile,
      platform: 'node',
    })

    // No `mcp` option and no devframes: the `'auto'` default finds an empty
    // agent surface, so no route mounts and no MCP code loads.
    const bundled = await import(pathToFileURL(outfile).href) as typeof import('../packages/hub/src/node/initiate')
    const hub = bundled.initHub({
      auth: false,
      base: bundled.DEVFRAMES_HUB_BASE,
      ws: false,
    })

    try {
      await hub.ready
      expect(hub.connectionMeta().mcp).toBeUndefined()
      const response = await hub.handler(new Request('http://localhost:3000/__devframes/__mcp', {
        headers: { origin: 'http://localhost:3000' },
      }))
      expect(response.status).toBe(404)
    }
    finally {
      await hub.close()
    }
  })

  it('preserves the runtime importer in Next production bundles', () => {
    const runtimeImportChunks = readdirSync(nextServerChunks)
      .filter(file => file.endsWith('.js'))
      .map(file => readFileSync(join(nextServerChunks, file), 'utf8'))
      .filter(source => source.includes('packages/devframe/src/node/import-runtime-module.ts'))

    expect(runtimeImportChunks).not.toHaveLength(0)
    expect(runtimeImportChunks.join('\n')).not.toContain('Cannot find module as expression is too dynamic')
  })
})
