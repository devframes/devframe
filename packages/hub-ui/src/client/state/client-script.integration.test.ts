import type { DevframeDockEntry } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
import { DEVFRAME_EVENTS } from 'devframe/constants'
import { createEventEmitter } from 'devframe/utils/events'
import { createSharedState } from 'devframe/utils/shared-state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createDocksContext } from './context'

interface StubSharedState<Value extends object> extends SharedState<Value> {
  push: (value: Value) => void
}

function createStubSharedState<Value extends object>(initialValue: Value): StubSharedState<Value> {
  const state = createSharedState({ initialValue }) as StubSharedState<Value>
  state.push = value => state.mutate(() => value)
  return state
}

function createStubRpc() {
  const sharedStates = new Map<string, StubSharedState<any>>()
  // eslint-disable-next-line slop/no-chained-type-assertions -- integration test double implements only the RPC surface createDocksContext exercises
  const rpc = {
    isTrusted: true,
    status: 'connected',
    connectionError: null,
    connectionMeta: { backend: 'live', configs: {} },
    connection: {},
    events: createEventEmitter<any>(),
    sharedState: {
      async get(key: string, options?: { initialValue?: object }) {
        if (!sharedStates.has(key))
          sharedStates.set(key, createStubSharedState(options?.initialValue ?? {}))
        return sharedStates.get(key)!
      },
    },
    client: { register: vi.fn() },
    call: vi.fn(),
  } as unknown as DevframeRpcClient
  return { rpc, sharedStates }
}

declare global {
  // eslint-disable-next-line vars-on-top -- test hook called by the dynamically imported client module
  var __DEVFRAME_CLIENT_SCRIPT_ATTEMPT__: (() => void | Promise<void>) | undefined
}

afterEach(() => {
  delete globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__
  vi.restoreAllMocks()
})

describe('dock client scripts', () => {
  it('retries setup on a later activation after it fails', async () => {
    expect.assertions(3)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let attempts = 0
    globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
      attempts++
      if (attempts === 1)
        throw new Error('setup failed')
    }
    const { rpc, sharedStates } = createStubRpc()
    const context = await createDocksContext('embedded', rpc)
    const entry = {
      id: 'retry-client-script',
      type: 'custom-render',
      title: 'Retry client script',
      icon: 'ph:play',
      renderer: {
        importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()',
      },
    } satisfies DevframeDockEntry

    sharedStates.get('devframe:docks')!.push([entry])
    await nextTick()

    await expect(context.docks.switchEntry(entry.id)).rejects.toThrow('setup failed')
    await context.docks.switchEntry(null)
    await expect(context.docks.switchEntry(entry.id)).resolves.toBe(true)
    expect(attempts).toBe(2)
  })
})

it('starts an eager iframe script before dock activation, once per RPC client', async () => {
  expect.assertions(3)
  let attempts = 0
  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
    attempts++
  }
  const { rpc, sharedStates } = createStubRpc()
  const context = await createDocksContext('embedded', rpc)
  const clientScript = { eager: true, importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' }
  const entry = { id: 'background-iframe', type: 'iframe', title: 'Background page script', icon: 'ph:browser', url: '/fixture', clientScript } satisfies DevframeDockEntry
  sharedStates.get('devframe:docks')!.push([entry])
  await expect.poll(() => attempts).toBe(1)
  expect(context.docks.selectedId).toBeNull()
  await context.docks.switchEntry(entry.id)
  expect(attempts).toBe(1)
})

it('waits for trust and keeps the same dock script bound separately to each RPC client', async () => {
  expect.assertions(4)
  let attempts = 0
  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
    attempts++
  }
  const first = createStubRpc()
  const second = createStubRpc()
  Object.assign(first.rpc, { isTrusted: false })
  await createDocksContext('embedded', first.rpc)
  await createDocksContext('embedded', second.rpc)
  const entry = {
    id: 'per-rpc-page-script',
    type: 'iframe',
    title: 'Page commands',
    icon: 'ph:browser',
    url: '/fixture',
    clientScript: { eager: true, importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' },
  } satisfies DevframeDockEntry
  first.sharedStates.get('devframe:docks')!.push([entry])
  await nextTick()
  expect(attempts).toBe(0)
  second.sharedStates.get('devframe:docks')!.push([entry])
  await expect.poll(() => attempts).toBe(1)
  Object.assign(first.rpc, { isTrusted: true })
  first.rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, true)
  await expect.poll(() => attempts).toBe(2)
  first.sharedStates.get('devframe:docks')!.push([{ ...entry }])
  second.sharedStates.get('devframe:docks')!.push([{ ...entry }])
  await nextTick()
  expect(attempts).toBe(2)
})

it('does not invoke action docks while initializing page scripts', async () => {
  expect.assertions(2)
  let attempts = 0
  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
    attempts++
  }
  const { rpc, sharedStates } = createStubRpc()
  const context = await createDocksContext('embedded', rpc)
  const entry = {
    id: 'explicit-action-script',
    type: 'action',
    title: 'Explicit action',
    icon: 'ph:play',
    action: { importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' },
  } satisfies DevframeDockEntry
  sharedStates.get('devframe:docks')!.push([entry])
  await nextTick()
  expect(attempts).toBe(0)
  await context.docks.switchEntry(entry.id)
  expect(attempts).toBe(1)
})

it('keeps an eager custom-render renderer activation-gated so it mounts into its panel', async () => {
  expect.assertions(2)
  let attempts = 0
  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
    attempts++
  }
  const { rpc, sharedStates } = createStubRpc()
  const context = await createDocksContext('embedded', rpc)
  const entry = {
    id: 'eager-renderer',
    type: 'custom-render',
    title: 'Eager renderer',
    icon: 'ph:play',
    renderer: { eager: true, importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' },
  } satisfies DevframeDockEntry
  sharedStates.get('devframe:docks')!.push([entry])
  await nextTick()
  // A renderer needs its mounted panel, so `eager` must not run it before activation.
  expect(attempts).toBe(0)
  await context.docks.switchEntry(entry.id)
  expect(attempts).toBe(1)
})

it.each([undefined, false] as const)('keeps page setup lazy when eager is %s', async (eager) => {
  expect.assertions(3)
  const attempt = vi.fn()
  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = attempt
  const { rpc, sharedStates } = createStubRpc()
  const context = await createDocksContext('embedded', rpc)
  const entry = {
    id: 'lazy-page',
    type: 'iframe',
    title: 'Lazy page',
    icon: 'ph:browser',
    url: '/fixture',
    clientScript: { eager, importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' },
  } satisfies DevframeDockEntry
  sharedStates.get('devframe:docks')!.push([entry])
  await nextTick()
  expect(attempt).not.toHaveBeenCalled()
  await context.docks.switchEntry(entry.id)
  expect(attempt).toHaveBeenCalledOnce()
  await context.docks.switchEntry(null)
  await context.docks.switchEntry(entry.id)
  expect(attempt).toHaveBeenCalledOnce()
})

it('awaits an eager page setup before activation and retries it after failure', async () => {
  expect.assertions(5)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let complete!: () => void
  let attempts = 0
  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
    attempts++
    if (attempts === 1)
      throw new Error('page setup failed')
    if (attempts === 2)
      return new Promise<void>((resolve) => { complete = resolve })
  }
  const { rpc, sharedStates } = createStubRpc()
  const context = await createDocksContext('embedded', rpc)
  const script = { importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' }
  const entry = {
    id: 'retry-page-before-activation',
    type: 'iframe',
    title: 'Retry page',
    icon: 'ph:play',
    url: '/fixture',
    clientScript: { ...script, eager: true },
  } satisfies DevframeDockEntry
  sharedStates.get('devframe:docks')!.push([entry])
  await expect.poll(() => attempts).toBe(1)
  const activation = context.docks.switchEntry(entry.id)
  await expect.poll(() => attempts).toBe(2)
  expect(context.docks.selectedId).toBeNull()
  complete()
  await expect(activation).resolves.toBe(true)
  expect(attempts).toBe(2)
})

it.each([false, true])('retries setup after trust is revoked during import (eager: %s)', async (eager) => {
  expect.assertions(6)
  const reportError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { rpc, sharedStates: states } = createStubRpc()
  const context = await createDocksContext('embedded', rpc)
  const docks = context.docks
  const fixture = globalThis as typeof globalThis & { __DF_IMPORT_GATE_UI__?: () => Promise<void>, __DF_IMPORT_SETUP_UI__?: () => void }
  let releaseImport!: () => void
  const importGate = new Promise<void>((resolve) => {
    releaseImport = resolve
  })
  const importing = vi.fn(() => importGate)
  const setup = vi.fn()
  fixture.__DF_IMPORT_GATE_UI__ = importing
  fixture.__DF_IMPORT_SETUP_UI__ = setup
  const entry = {
    id: `revoked-import-${eager}`,
    type: 'iframe',
    title: 'Revoked import',
    icon: 'ph:browser',
    url: '/fixture',
    clientScript: {
      eager,
      importFrom: `data:text/javascript,await globalThis.__DF_IMPORT_GATE_UI__(); export default () => globalThis.__DF_IMPORT_SETUP_UI__(); // ${eager}`,
    },
  } satisfies DevframeDockEntry
  try {
    states.get('devframe:docks')!.push([entry])
    const activation = docks.switchEntry(entry.id)
    const rejected = expect(activation).rejects.toThrow('no longer trusted')
    await expect.poll(() => importing.mock.calls.length).toBe(1)
    Object.assign(rpc, { isTrusted: false })
    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, false)
    releaseImport()
    await rejected
    expect(setup).not.toHaveBeenCalled()
    expect(docks.selectedId).toBeNull()
    Object.assign(rpc, { isTrusted: true })
    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, true)
    await expect(docks.switchEntry(entry.id)).resolves.toBe(true)
    expect(setup).toHaveBeenCalledOnce()
  }
  finally {
    releaseImport()
    delete fixture.__DF_IMPORT_GATE_UI__
    delete fixture.__DF_IMPORT_SETUP_UI__
    reportError.mockRestore()
  }
})

it('does not activate an iframe when trust is lost while its setup completes', async () => {
  expect.assertions(2)
  const { rpc, sharedStates: states } = createStubRpc()
  const context = await createDocksContext('embedded', rpc)
  const docks = context.docks
  const fixture = globalThis as typeof globalThis & { __DF_SETUP_REVOKE_UI__?: () => void }
  fixture.__DF_SETUP_REVOKE_UI__ = () => {
    Object.assign(rpc, { isTrusted: false })
    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, false)
  }
  const entry = {
    id: 'revoked-during-setup',
    type: 'iframe',
    title: 'Revoked setup',
    icon: 'ph:browser',
    url: '/fixture',
    clientScript: { importFrom: 'data:text/javascript,export default async () => globalThis.__DF_SETUP_REVOKE_UI__()' },
  } satisfies DevframeDockEntry
  try {
    states.get('devframe:docks')!.push([entry])
    await expect(docks.switchEntry(entry.id)).resolves.toBe(false)
    expect(docks.selectedId).toBeNull()
  }
  finally {
    delete fixture.__DF_SETUP_REVOKE_UI__
  }
})
