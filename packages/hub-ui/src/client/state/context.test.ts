import type { DevframeDockEntry } from '@devframes/hub'
import type { DevframeRpcClient, DockSessionStorage } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
import { HUB_EVENTS } from '@devframes/hub/constants'
import { createEventEmitter } from 'devframe/utils/events'
import { createSharedState } from 'devframe/utils/shared-state'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { createDocksContext } from './context'
import { executeSetupScript } from './setup-script'

vi.mock('./setup-script', () => ({
  executeSetupScript: vi.fn(async () => {}),
}))

const gitEntry = {
  id: 'git',
  type: 'custom-render',
  title: 'Git',
  icon: 'ph:git-branch-duotone',
  renderer: { importFrom: '/git-client.js' },
} satisfies DevframeDockEntry

interface StubSharedState<Value extends object> extends SharedState<Value> {
  push: (value: Value) => void
}

function createStubSharedState<Value extends object>(initialValue: Value): StubSharedState<Value> {
  const state = createSharedState({ initialValue }) as StubSharedState<Value>
  state.push = value => state.mutate(() => value)
  return state
}

function createStubRpc() {
  let isTrusted = false
  const events = createEventEmitter<any>()
  const sharedStates = new Map<string, StubSharedState<any>>()
  const rpc = {
    get isTrusted() {
      return isTrusted
    },
    status: 'connected',
    connectionError: null,
    connectionMeta: { backend: 'live', configs: {} },
    connection: {},
    events,
    sharedState: {
      async get(key: string, options?: { initialValue?: object }) {
        if (!sharedStates.has(key))
          sharedStates.set(key, createStubSharedState(options?.initialValue ?? {}))
        return sharedStates.get(key)!
      },
    },
    client: {
      register: vi.fn(),
    },
    call: vi.fn(),
  } as unknown as DevframeRpcClient

  return {
    rpc,
    sharedStates,
    trust() {
      isTrusted = true
      events.emit('rpc:is-trusted:updated', true)
    },
  }
}

async function flushRestore(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('createDocksContext', () => {
  it('reports the restored panel state and later open-state transitions', async () => {
    expect.assertions(4)

    const { rpc, sharedStates, trust } = createStubRpc()
    const session = ref<DockSessionStorage>({
      open: true,
      selectedDockId: 'git',
      selectedDockRoute: null,
    })
    await createDocksContext('embedded', rpc, undefined, session)

    trust()
    sharedStates.get('devframe:docks')!.push([gitEntry])
    sharedStates.get('devframe:dock-renderers')!.push({})
    await flushRestore()
    await vi.waitFor(() => {
      if (vi.mocked(rpc.call).mock.calls.length !== 1)
        throw new Error('waiting for the restored panel state report')
    })

    expect(rpc.call).toHaveBeenCalledTimes(1)
    expect(rpc.call).toHaveBeenLastCalledWith(HUB_EVENTS.rpc.docksPanelState, true)

    session.value.open = false
    await nextTick()
    expect(rpc.call).toHaveBeenLastCalledWith(HUB_EVENTS.rpc.docksPanelState, false)

    session.value.open = false
    await nextTick()
    expect(rpc.call).toHaveBeenCalledTimes(2)
  })

  it('mounts a restored dock once after all initial server state arrives', async () => {
    expect.assertions(7)

    const { rpc, sharedStates, trust } = createStubRpc()
    const executeSetupScriptMock = vi.mocked(executeSetupScript)
    executeSetupScriptMock.mockClear()
    const session = ref<DockSessionStorage>({
      open: true,
      selectedDockId: 'git',
      selectedDockRoute: null,
    })
    const context = await createDocksContext('embedded', rpc, undefined, session)

    /** Mirrors the authorization gate temporarily closing the panel on reload. */
    session.value.open = false
    trust()

    expect(session.value.open).toBe(false)

    sharedStates.get('devframe:docks')!.push([gitEntry])
    await flushRestore()

    expect(context.docks.selected).toBeNull()
    expect(session.value.open).toBe(false)
    expect(executeSetupScriptMock).not.toHaveBeenCalled()

    sharedStates.get('devframe:dock-renderers')!.push({})
    await flushRestore()

    expect(context.docks.selected?.id).toBe('git')
    expect(session.value.open).toBe(true)
    expect(executeSetupScriptMock).toHaveBeenCalledOnce()
  })

  it('keeps navigation performed before the initial server registry arrives', async () => {
    expect.assertions(2)

    const { rpc, sharedStates, trust } = createStubRpc()
    const session = ref<DockSessionStorage>({
      open: true,
      selectedDockId: 'git',
      selectedDockRoute: null,
    })
    const context = await createDocksContext('embedded', rpc, undefined, session)

    session.value.open = false
    trust()
    await context.docks.switchEntry('~settings')

    sharedStates.get('devframe:docks')!.push([gitEntry])
    sharedStates.get('devframe:dock-renderers')!.push({})
    await flushRestore()

    expect(context.docks.selected?.id).toBe('~settings')
    expect(session.value.open).toBe(true)
  })

  it('keeps a dock closed when the user closes it before initialization finishes', async () => {
    expect.assertions(2)

    const { rpc, sharedStates, trust } = createStubRpc()
    const session = ref<DockSessionStorage>({
      open: true,
      selectedDockId: 'git',
      selectedDockRoute: null,
    })
    const context = await createDocksContext('embedded', rpc, undefined, session)

    trust()
    await context.docks.switchEntry(null)
    sharedStates.get('devframe:docks')!.push([gitEntry])
    sharedStates.get('devframe:dock-renderers')!.push({})
    await flushRestore()

    expect(context.docks.selected).toBeNull()
    expect(session.value.open).toBe(false)
  })
})
