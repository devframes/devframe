import type { DevframeDefinition } from 'devframe/types'
import type { DevframeDockEntry } from '../../types/docks'
import type { DevframeViewProviders } from '../../types/view-providers'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostContext, startHttpAndWs } from 'devframe/node'
import { getInternalContext } from 'devframe/node/hub-internals'
import { describe, expect, it, vi } from 'vitest'
import { createHubContext } from '../context'
import { mountViewProvider } from '../mount-devframe'

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

describe('mountViewProvider', () => {
  it('publishes the provider base to shared state without registering a dock', async () => {
    const context = await createHubContext({
      cwd: process.cwd(),
      mode: 'build',
      host: createHost(),
    })

    const def: DevframeDefinition = {
      id: 'json-render',
      name: 'JSON Render',
      version: '0.0.0',
      packageName: '@devframes/json-render-ui',
      homepage: 'https://example.test',
      description: 'provider',
      setup: () => {},
    }
    await mountViewProvider(context, 'json-render', def, { base: '/__devframes/json-render/' })

    // The provider renders other docks — it is not a dock itself.
    const docks = await context.rpc.sharedState.get<DevframeDockEntry[]>('devframe:docks')
    expect(docks.value()).toEqual([])

    const providers = await context.rpc.sharedState.get<DevframeViewProviders>('devframe:view-providers')
    expect(providers.value()).toEqual({ 'json-render': { base: '/__devframes/json-render/' } })
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
