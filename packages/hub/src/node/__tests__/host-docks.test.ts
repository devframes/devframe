import type { DevframeViewLauncher } from '../../types/docks'
import type { DevframeHubContext } from '../context'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REMOTE_CONNECTION_KEY } from 'devframe/constants'
import { getInternalContext } from 'devframe/node/hub-internals'
import { describe, expect, it, vi } from 'vitest'
import { parseRemoteConnection } from '../../client/remote'
import { DEFAULT_STATE_USER_SETTINGS } from '../../constants'
import { DevframeDocksHost } from '../host-docks'

type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> }

function createContext(): DevframeHubContext {
  const storageDir = mkdtempSync(join(tmpdir(), 'devframe-hub-docks-'))
  const partial: DeepPartial<DevframeHubContext> = {
    host: {
      mountStatic: () => {},
      resolveOrigin: () => 'http://localhost:5173',
      getStorageDir: () => storageDir,
    },
  }
  return partial as DevframeHubContext
}

describe('devframeDockHost remote URL enrichment', () => {
  it('preserves hash routes and replaces existing remote descriptors', () => {
    const context = createContext()
    getInternalContext(context).wsEndpoint = { url: 'ws://localhost:4173' }
    const host = new DevframeDocksHost(context)

    host.register({
      type: 'iframe',
      id: 'remote',
      title: 'Remote',
      icon: 'ph:cube-duotone',
      url: 'https://remote.test/app#/inspect?tab=state',
      remote: true,
    })

    const first = host.values()[0]
    expect(first.type).toBe('iframe')
    const firstUrl = first.type === 'iframe'
      ? first.url
      : ''
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
      icon: 'ph:cube-duotone',
      url: firstUrl,
      remote: true,
    })

    const second = host.values()[0]
    const secondUrl = second.type === 'iframe'
      ? second.url
      : ''
    expect(secondUrl.match(new RegExp(REMOTE_CONNECTION_KEY, 'g'))).toHaveLength(1)
    expect(secondUrl).toContain('#/inspect?tab=state&')
  })

  it('preserves non-route fragments with the ampersand descriptor form', () => {
    const context = createContext()
    getInternalContext(context).wsEndpoint = { url: 'ws://localhost:4173' }
    const host = new DevframeDocksHost(context)

    host.register({
      type: 'iframe',
      id: 'remote',
      title: 'Remote',
      icon: 'ph:cube-duotone',
      url: 'https://remote.test/app#section',
      remote: true,
    })

    const entry = host.values()[0]
    const url = entry.type === 'iframe'
      ? entry.url
      : ''
    expect(url).toContain(`#section&${REMOTE_CONNECTION_KEY}=`)
    expect(parseRemoteConnection(url)?.websocket).toBe('ws://localhost:4173')
  })
})

describe('devframeDockHost grouping', () => {
  it('registers a group entry: stored, projected, and emitted', () => {
    const host = new DevframeDocksHost(createContext())
    const emitted: string[] = []
    host.events.on('docks:entry:updated', entry => emitted.push(entry.id))

    host.register({
      type: 'group',
      id: 'nuxt',
      title: 'Nuxt',
      icon: 'logos:nuxt-icon',
      category: 'framework',
      defaultChildId: 'nuxt:overview',
    })

    expect(host.views.has('nuxt')).toBe(true)
    expect(emitted).toEqual(['nuxt'])
    const entry = host.values()[0]
    expect(entry.type).toBe('group')
    expect(entry).toMatchObject({ id: 'nuxt', defaultChildId: 'nuxt:overview' })
  })

  it('round-trips a member groupId through values()', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'iframe',
      id: 'nuxt:overview',
      title: 'Overview',
      icon: 'ph:gauge-duotone',
      url: '/__nuxt-overview/',
      groupId: 'nuxt',
    })

    const entry = host.values()[0]
    expect(entry.groupId).toBe('nuxt')
  })

  it('tolerates a member registered before its group (orphan tolerance)', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'iframe',
      id: 'nuxt:overview',
      title: 'Overview',
      icon: 'ph:gauge-duotone',
      url: '/__nuxt-overview/',
      groupId: 'nuxt',
    })
    host.register({
      type: 'group',
      id: 'nuxt',
      title: 'Nuxt',
      icon: 'logos:nuxt-icon',
    })

    const ids = host.values().map(entry => entry.id)
    expect(ids).toEqual(['nuxt:overview', 'nuxt'])
  })

  it('rejects an entry that groups itself (DF8103)', () => {
    const host = new DevframeDocksHost(createContext())
    expect(() => host.register({
      type: 'iframe',
      id: 'self',
      title: 'Self',
      icon: 'ph:gauge-duotone',
      url: '/__self/',
      groupId: 'self',
    })).toThrow('cannot set groupId to its own id')
  })

  it('rejects a nested group (DF8104)', () => {
    const host = new DevframeDocksHost(createContext())
    expect(() => host.register({
      type: 'group',
      id: 'child-group',
      title: 'Child Group',
      icon: 'logos:nuxt-icon',
      groupId: 'parent-group',
    })).toThrow('nested groups are unsupported')
  })

  it('updates a group entry while preserving type and rejecting id change', () => {
    const host = new DevframeDocksHost(createContext())
    const handle = host.register({
      type: 'group',
      id: 'nuxt',
      title: 'Nuxt',
      icon: 'logos:nuxt-icon',
    })

    handle.update({ title: 'Nuxt DevTools' })
    const entry = host.views.get('nuxt')!
    expect(entry.type).toBe('group')
    expect(entry.title).toBe('Nuxt DevTools')

    expect(() => handle.update({ id: 'other' })).toThrow('Cannot change the id of dock "nuxt" to "other"')
  })

  it('rejects updating a dock that is not registered (DF8102)', () => {
    const host = new DevframeDocksHost(createContext())
    expect(() => host.update({
      type: 'iframe',
      id: 'ghost',
      title: 'Ghost',
      icon: 'ph:ghost-duotone',
      url: '/__ghost/',
    })).toThrow('Dock with id "ghost" is not registered and cannot be updated')
  })
})

describe('devframeDockHost activate', () => {
  it('emits a docks:activate event carrying the id and params', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'iframe',
      id: 'terminals',
      title: 'Terminals',
      icon: 'ph:terminal-window-duotone',
      url: '/__terminals/',
    })

    const activations: Array<{ dockId: string, params?: Record<string, unknown> }> = []
    host.events.on('docks:activate', a => activations.push(a))

    host.activate('terminals', { sessionId: 'sess-1' })
    expect(activations).toEqual([
      {
        dockId: 'terminals',
        params: { sessionId: 'sess-1' },
      },
    ])
  })

  it('still emits for an unknown dock but warns (DF8107, graceful)', () => {
    const host = new DevframeDocksHost(createContext())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const activations: string[] = []
      host.events.on('docks:activate', a => activations.push(a.dockId))

      host.activate('nope')
      expect(activations).toEqual(['nope'])
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0]!.join(' ')).toMatch(/unknown dock id/i)
    }
    finally {
      warn.mockRestore()
    }
  })
})

describe('devframeDockHost ~builtin category', () => {
  it('returns no docks until an integration registers one', () => {
    const host = new DevframeDocksHost(createContext())
    expect(host.values()).toEqual([])
  })

  it('preserves a ~builtin view without a category untouched', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: '~builtin',
      id: '~settings',
      title: 'Settings',
      icon: 'ph:gear-duotone',
    })

    const entry = host.values()[0]
    expect(entry).toMatchObject({ id: '~settings', type: '~builtin' })
    expect(entry.category).toBeUndefined()
  })

  it('preserves an explicit category on a ~builtin view', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: '~builtin',
      id: '~settings',
      title: 'Settings',
      icon: 'ph:gear-duotone',
      category: 'app',
    })

    expect(host.values()[0].category).toBe('app')
  })

  it('leaves a non-builtin view without a category untouched', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'iframe',
      id: 'app:overview',
      title: 'Overview',
      icon: 'ph:gauge-duotone',
      url: '/__app/',
    })

    expect(host.values()[0].category).toBeUndefined()
  })

  it('carries a launcher bound to a command + terminal session with a digest, without onLaunch', () => {
    const host = new DevframeDocksHost(createContext())
    host.register({
      type: 'launcher',
      id: 'app:build',
      title: 'Build',
      icon: 'ph:hammer-duotone',
      launcher: {
        title: 'Run build',
        status: 'loading',
        command: 'app:run-build',
        terminalSessionId: 'build-session',
        digest: 'compiling…',
      },
    })

    const entry = host.values()[0]
    expect(entry.type).toBe('launcher')
    const launcher = entry.type === 'launcher'
      ? entry.launcher
      : undefined
    expect(launcher).toMatchObject({
      command: 'app:run-build',
      terminalSessionId: 'build-session',
      digest: 'compiling…',
    })
    expect(launcher?.onLaunch).toBeUndefined()

    // Progress patches flow through update() like any other entry field.
    host.update({
      type: 'launcher',
      id: 'app:build',
      title: 'Build',
      icon: 'ph:hammer-duotone',
      launcher: { ...launcher!, digest: 'done', status: 'success' },
    })
    const updated = host.values()[0]
    const updatedLauncher = updated.type === 'launcher'
      ? updated.launcher
      : undefined
    expect(updatedLauncher?.digest).toBe('done')
    expect(updatedLauncher?.status).toBe('success')
  })

  it('updates a registered entry whose stored view was frozen (Immer-projected shared state)', () => {
    const host = new DevframeDocksHost(createContext())
    const handle = host.register<DevframeViewLauncher>({
      type: 'launcher',
      id: 'app:build',
      title: 'Build',
      icon: 'ph:hammer-duotone',
      launcher: { title: 'Run build', status: 'idle', command: 'app:run-build' },
    })

    // Projecting the entry into `devframe:docks` shared state runs it through
    // Immer's `produce`, which deep-freezes the very object the registry holds.
    Object.freeze(host.values()[0])

    // The launch handler patches the launcher as the process boots; the update
    // must not throw "Cannot assign to read only property" on the frozen entry.
    expect(() => handle.update({
      launcher: {
        title: 'Run build',
        status: 'loading',
        command: 'app:run-build',
        terminalSessionId: 'build-session',
        digest: 'compiling…',
      },
    })).not.toThrow()

    const entry = host.values()[0]
    const launcher = entry.type === 'launcher'
      ? entry.launcher
      : undefined
    expect(launcher?.status).toBe('loading')
    expect(launcher?.digest).toBe('compiling…')
  })
})

describe('devframeDockHost bare-specifier client scripts', () => {
  function withWarnSpy(run: (warn: ReturnType<typeof vi.spyOn>) => void): void {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      run(warn)
    }
    finally {
      warn.mockRestore()
    }
  }

  it('warns (DF8111) for a bare-specifier client script on a host without clientModuleResolution', () => {
    withWarnSpy((warn) => {
      const host = new DevframeDocksHost(createContext())
      host.register({
        type: 'action',
        id: 'vue-tracer',
        title: 'Vue Tracer',
        icon: 'ph:crosshair-simple-duotone',
        action: { importFrom: 'vite-plugin-vue-tracer/client/vite-devtools' },
      })
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0]!.join(' ')).toMatch(/DF8111/)
      expect(warn.mock.calls[0]!.join(' ')).toContain('vite-plugin-vue-tracer/client/vite-devtools')
    })
  })

  it('stays silent when the host advertises clientModuleResolution', () => {
    withWarnSpy((warn) => {
      const context = createContext()
      ;(context as { staticConfig: Record<string, unknown> }).staticConfig
        = {
          dock: { clientModuleResolution: '/@id/{specifier}' },
        }
      const host = new DevframeDocksHost(context)
      host.register({
        type: 'action',
        id: 'vue-tracer',
        title: 'Vue Tracer',
        icon: 'ph:crosshair-simple-duotone',
        action: { importFrom: 'vite-plugin-vue-tracer/client/vite-devtools' },
      })
      expect(warn).not.toHaveBeenCalled()
    })
  })

  it('stays silent for URL client scripts on any host', () => {
    withWarnSpy((warn) => {
      const host = new DevframeDocksHost(createContext())
      host.register({
        type: 'iframe',
        id: 'a11y',
        title: 'A11y',
        icon: 'ph:person-arms-spread-duotone',
        url: '/__devframes/a11y/',
        clientScript: { importFrom: '/@fs/abs/inject.js' },
      })
      expect(warn).not.toHaveBeenCalled()
    })
  })
})

function createInitContext(options: { projectDir: string, legacyDir?: string }): DevframeHubContext {
  const host = {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost:5173',
    getStorageDir: () => options.projectDir,
  }
  // The optional legacy capability is not part of `DevframeHost`; attach it
  // duck-typed, the way a host that moved its storage exposes it.
  if (options.legacyDir) {
    Object.assign(host, {
      getLegacyStorageDir: () => options.legacyDir!,
    })
  }
  // A minimal stub for an unused part of the wide hub context surface.
  // eslint-disable-next-line slop/no-chained-type-assertions -- minimal stub for an unused-surface boundary
  return {
    host,
    rpc: {
      // The fallback under test only decides the initial value; the shared
      // state itself is the real one in production.
      sharedState: {
        get: async (_key: string, init: { sharedState?: unknown }) => init.sharedState,
      },
    },
  } as unknown as DevframeHubContext
}

describe('devframeDockHost settings fallback', () => {
  function dirs() {
    const projectDir = mkdtempSync(join(tmpdir(), 'devframe-hub-project-'))
    const legacyDir = mkdtempSync(join(tmpdir(), 'devframe-hub-legacy-'))
    return { projectDir, legacyDir }
  }

  it('seeds the dock layout from the legacy settings file', async () => {
    const { projectDir, legacyDir } = dirs()
    writeFileSync(join(legacyDir, 'settings.json'), JSON.stringify({
      docksHidden: ['a11y'],
      docksPinned: ['terminals'],
    }))

    const host = new DevframeDocksHost(createInitContext({ projectDir, legacyDir }))
    await host.init()

    expect(host.userSettings.value()).toMatchObject({
      docksHidden: ['a11y'],
      docksPinned: ['terminals'],
      // Missing fields keep the documented defaults.
      commandShortcuts: {},
      docksCustomOrder: {},
    })
  })

  it('ignores the legacy file once this checkout has its own settings', async () => {
    const { projectDir, legacyDir } = dirs()
    writeFileSync(join(legacyDir, 'settings.json'), JSON.stringify({
      docksHidden: ['legacy'],
    }))
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'settings.json'), JSON.stringify({
      docksHidden: ['own'],
    }))

    const host = new DevframeDocksHost(createInitContext({ projectDir, legacyDir }))
    await host.init()

    expect(host.userSettings.value().docksHidden).toEqual(['own'])
  })

  it('keeps the defaults when the host exposes no legacy directory', async () => {
    const { projectDir } = dirs()
    const host = new DevframeDocksHost(createInitContext({ projectDir }))
    await host.init()
    expect(host.userSettings.value()).toEqual(DEFAULT_STATE_USER_SETTINGS())
  })

  it('keeps the defaults when the legacy file is unreadable', async () => {
    const { projectDir, legacyDir } = dirs()
    writeFileSync(join(legacyDir, 'settings.json'), '{ not json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const host = new DevframeDocksHost(createInitContext({ projectDir, legacyDir }))
      await host.init()
      expect(host.userSettings.value()).toEqual(DEFAULT_STATE_USER_SETTINGS())
      expect(warn).toHaveBeenCalled()
    }
    finally {
      warn.mockRestore()
    }
  })
})
