import type { DevframeDockEntry } from '../../types/docks'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostContext } from 'devframe/node'
import { getInternalContext } from 'devframe/node/hub-internals'
import { describe, expect, it, vi } from 'vitest'
import { serveTestContext } from '../../../../../tests/helpers/serve-test-context'
import { createHubContext } from '../context'

function createHost(storageDir = mkdtempSync(join(tmpdir(), 'devframe-hub-context-'))) {
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost:5173',
    getStorageDir: () => storageDir,
  }
}

describe('createHubContext shared state', () => {
  it('seeds an empty dock list, since the hub synthesizes no built-in docks', async () => {
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

describe('createHubContext remote dock republishing', () => {
  it('re-projects a remote dock once the WS endpoint resolves after registration', async () => {
    // Mirrors vitejs/devtools#517/#520: a remote iframe dock can register
    // before an async WS bind (side-car port probing, an `unbound` tier
    // waiting on the host's own `attach()`) resolves `wsEndpoint`. Nothing
    // else re-registers that dock once the port is known, so the fix has to
    // re-project every dock when the endpoint changes.
    const context = await createHubContext({
      cwd: process.cwd(),
      mode: 'build',
      host: createHost(),
    })

    context.docks.register({
      type: 'iframe',
      id: 'remote',
      title: 'Remote',
      icon: 'ph:cube-duotone',
      url: 'https://remote.test/app',
      remote: true,
    })

    // The registration's own refresh is debounced too, so let it settle before
    // asserting the pre-bind projection.
    await new Promise(resolve => setTimeout(resolve, 20))

    const docksState = await context.rpc.sharedState.get<DevframeDockEntry[]>('devframe:docks')
    const beforeBind = docksState.value()[0]
    expect(beforeBind?.type === 'iframe' ? beforeBind.url : undefined).toBe('https://remote.test/app')

    getInternalContext(context).setWsEndpoint({ url: 'ws://localhost:4173' })
    // The refresh is debounced (0ms in `mode: 'build'`, still a macrotask).
    await new Promise(resolve => setTimeout(resolve, 20))

    const afterBind = docksState.value()[0]
    const afterUrl = afterBind?.type === 'iframe' ? afterBind.url : ''
    expect(afterUrl).not.toBe('https://remote.test/app')
    expect(afterUrl).toContain('https://remote.test/app')

    getInternalContext(context).setWsEndpoint(undefined)
  })
})

describe('served context remote endpoint metadata', () => {
  it('sets and clears the internal websocket endpoint', async () => {
    const context = await createHostContext({
      cwd: process.cwd(),
      mode: 'dev',
      host: createHost(),
    })

    const started = await serveTestContext({
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
