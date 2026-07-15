import type { DevframeDockEntry } from '../../types/docks'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostContext, startHttpAndWs } from 'devframe/node'
import { getInternalContext } from 'devframe/node/hub-internals'
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
  it('seeds an empty dock list — the hub synthesizes no built-in docks', async () => {
    const context = await createHubContext({
      cwd: process.cwd(),
      mode: 'build',
      host: createHost(),
    })

    const docks = await context.rpc.sharedState.get<DevframeDockEntry[]>('devframe:docks')
    expect(docks.value()).toEqual([])
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

    // The advertised WS endpoint is dialable: the loopback IP normalizes to
    // `localhost`, matching the HTTP origin's normalization.
    expect(getInternalContext(context).wsEndpoint).toEqual({
      url: `ws://localhost:${started.port}`,
    })

    await started.close()
    expect(getInternalContext(context).wsEndpoint).toBeUndefined()
  })
})
