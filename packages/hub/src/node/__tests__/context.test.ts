import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostContext, startHttpAndWs } from 'devframe/node'
import { getInternalContext } from 'devframe/node/internal'
import { describe, expect, it } from 'vitest'
import { createHubContext } from '../context'

function createHost(storageDir = mkdtempSync(join(tmpdir(), 'devframe-hub-context-'))) {
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost:5173',
    getStorageDir: () => storageDir,
  }
}

describe('createHubContext shared state', () => {
  it('seeds built-in docks and commands immediately', async () => {
    const context = await createHubContext({
      cwd: process.cwd(),
      mode: 'build',
      host: createHost(),
    })

    const docks = await context.rpc.sharedState.get('devframe:docks')
    expect(docks.value().map(dock => dock.id)).toEqual([
      '~terminals',
      '~messages',
      '~settings',
    ])

    const commands = await context.rpc.sharedState.get('devframe:commands')
    expect(commands.value().map(command => command.id)).toContain('hub:open-path')
  })
})

describe('startHttpAndWs remote endpoint metadata', () => {
  it('sets and clears the internal websocket endpoint', async () => {
    const context = await createHostContext({
      cwd: process.cwd(),
      mode: 'dev',
      host: createHost(),
    })

    const started = await startHttpAndWs({
      context,
      host: '127.0.0.1',
      port: 0,
    })

    expect(getInternalContext(context).wsEndpoint).toEqual({
      url: `ws://127.0.0.1:${started.port}`,
    })

    await started.close()
    expect(getInternalContext(context).wsEndpoint).toBeUndefined()
  })
})
