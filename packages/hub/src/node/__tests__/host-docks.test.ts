import type { HubNodeContext } from '../context'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REMOTE_CONNECTION_KEY } from 'devframe/constants'
import { getInternalContext } from 'devframe/node/internal'
import { describe, expect, it } from 'vitest'
import { parseRemoteConnection } from '../../client/remote'
import { DevframeDockHost } from '../host-docks'

function createContext(): HubNodeContext {
  const storageDir = mkdtempSync(join(tmpdir(), 'devframe-hub-docks-'))
  return {
    host: {
      mountStatic: () => {},
      resolveOrigin: () => 'http://localhost:5173',
      getStorageDir: () => storageDir,
    },
  } as unknown as HubNodeContext
}

describe('devframeDockHost remote URL enrichment', () => {
  it('preserves hash routes and replaces existing remote descriptors', () => {
    const context = createContext()
    getInternalContext(context).wsEndpoint = { url: 'ws://localhost:4173' }
    const host = new DevframeDockHost(context)

    host.register({
      type: 'iframe',
      id: 'remote',
      title: 'Remote',
      url: 'https://remote.test/app#/inspect?tab=state',
      remote: true,
    })

    const first = host.values({ includeBuiltin: false })[0]
    expect(first.type).toBe('iframe')
    const firstUrl = first.type === 'iframe' ? first.url : ''
    expect(firstUrl).toContain(`#/inspect?tab=state&${REMOTE_CONNECTION_KEY}=`)
    expect(parseRemoteConnection(firstUrl)).toMatchObject({
      backend: 'websocket',
      websocket: 'ws://localhost:4173',
      origin: 'http://localhost:5173',
    })

    host.update({
      type: 'iframe',
      id: 'remote',
      title: 'Remote',
      url: firstUrl,
      remote: true,
    })

    const second = host.values({ includeBuiltin: false })[0]
    const secondUrl = second.type === 'iframe' ? second.url : ''
    expect(secondUrl.match(new RegExp(REMOTE_CONNECTION_KEY, 'g'))).toHaveLength(1)
    expect(secondUrl).toContain('#/inspect?tab=state&')
  })

  it('preserves non-route fragments with the ampersand descriptor form', () => {
    const context = createContext()
    getInternalContext(context).wsEndpoint = { url: 'ws://localhost:4173' }
    const host = new DevframeDockHost(context)

    host.register({
      type: 'iframe',
      id: 'remote',
      title: 'Remote',
      url: 'https://remote.test/app#section',
      remote: true,
    })

    const entry = host.values({ includeBuiltin: false })[0]
    const url = entry.type === 'iframe' ? entry.url : ''
    expect(url).toContain(`#section&${REMOTE_CONNECTION_KEY}=`)
    expect(parseRemoteConnection(url)?.websocket).toBe('ws://localhost:4173')
  })
})
