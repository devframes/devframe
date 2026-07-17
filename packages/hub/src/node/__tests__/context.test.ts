import type { DevframeDockEntry } from '../../types/docks'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostContext, startHttpAndWs } from 'devframe/node'
import { getInternalContext } from 'devframe/node/hub-internals'
import { describe, expect, it, vi } from 'vitest'
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

describe('createHubContext dock activation', () => {
  it('mirrors an activation into shared state and broadcasts it live', async () => {
    const context = await createHubContext({
      cwd: process.cwd(),
      mode: 'build',
      host: createHost(),
    })
    context.docks.register({
      type: 'iframe',
      id: 'devframes_plugin_terminals',
      title: 'Terminals',
      icon: 'ph:terminal-window-duotone',
      url: '/__devframes_plugin_terminals/',
    })

    const broadcast = vi.spyOn(context.rpc, 'broadcast').mockResolvedValue()
    context.docks.activate('devframes_plugin_terminals', { sessionId: 'sess-1' })

    const active = await context.rpc.sharedState.get<{ activation: unknown }>('devframe:docks:active')
    expect(active.value().activation).toEqual({
      dockId: 'devframes_plugin_terminals',
      params: { sessionId: 'sess-1' },
    })
    expect(broadcast).toHaveBeenCalledWith({
      method: 'devframe:docks:activate',
      args: [{ dockId: 'devframes_plugin_terminals', params: { sessionId: 'sess-1' } }],
    })
    broadcast.mockRestore()
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
