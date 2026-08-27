import type { DevframeDockEntry, DevframeDockPanelState } from '@devframes/hub'
import type { DevframeRpcClient, DockSessionStorage } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
import { HUB_EVENTS } from '@devframes/hub/constants'
import { DEVFRAME_EVENTS } from 'devframe/constants'
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
      events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, true)
    },
  }
}

async function flushRestore(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('createDocksContext', () => {
  it('exposes restored panel state and emits selected, hidden, and closed changes', async () => {
    expect.assertions(9)

    const { rpc, sharedStates, trust } = createStubRpc()
    const panelVisible = ref(false)
    const session = ref<DockSessionStorage>({
      open: true,
      selectedDockId: 'git',
      selectedDockRoute: null,
    })
    const context = await createDocksContext('embedded', rpc, undefined, session, panelVisible)
    const panelStates: DevframeDockPanelState[] = []
    context.panel.events.on(
      HUB_EVENTS.client.docksPanelStateChanged,
      panelState => panelStates.push(panelState),
    )

    panelVisible.value = true
    await nextTick()
    expect(panelStates).toEqual([{ state: 'open', selectedDockId: 'git' }])
    panelVisible.value = false
    await nextTick()
    panelStates.length = 0

    trust()
    sharedStates.get('devframe:docks')!.push([gitEntry])
    sharedStates.get('devframe:dock-renderers')!.push({})
    await flushRestore()
    expect(context.panel.state).toEqual({ state: 'hidden', selectedDockId: 'git' })
    expect(panelStates).toEqual([])

    panelVisible.value = true
    await nextTick()
    expect(panelStates.at(-1)).toEqual({ state: 'open', selectedDockId: 'git' })

    session.value.selectedDockId = '~settings'
    await nextTick()
    expect(panelStates.at(-1)).toEqual({ state: 'open', selectedDockId: '~settings' })

    panelVisible.value = false
    await nextTick()
    expect(panelStates.at(-1)).toEqual({ state: 'hidden', selectedDockId: '~settings' })

    session.value.open = false
    session.value.selectedDockId = null
    await nextTick()
    expect(panelStates.at(-1)).toEqual({ state: 'hidden' })

    panelVisible.value = true
    await nextTick()
    expect(panelStates.at(-1)).toEqual({ state: 'closed' })

    panelVisible.value = true
    session.value.open = false
    await nextTick()
    expect(panelStates).toHaveLength(5)
  })

  it('mounts a restored dock once after all initial server state arrives', async () => {
    expect.assertions(8)

    const { rpc, sharedStates, trust } = createStubRpc()
    const executeSetupScriptMock = vi.mocked(executeSetupScript)
    executeSetupScriptMock.mockClear()
    let setupPanelState: DevframeDockPanelState | undefined
    executeSetupScriptMock.mockImplementationOnce(async (_dockEntry, scriptContext) => {
      setupPanelState = scriptContext.panel.state
    })
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
    expect(setupPanelState).toEqual({ state: 'open', selectedDockId: 'git' })
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

  it('reopens a group\'s last-opened member ahead of defaultChildId', async () => {
    expect.assertions(4)

    const { rpc, sharedStates, trust } = createStubRpc()
    // No `groupLastChildIds` seed — mirrors a session store persisted before
    // the field existed.
    const session = ref<DockSessionStorage>({
      open: false,
      selectedDockId: null,
      selectedDockRoute: null,
    })
    const context = await createDocksContext('embedded', rpc, undefined, session)

    trust()
    sharedStates.get('devframe:docks')!.push([
      { id: 'nuxt', type: 'group', title: 'Nuxt', icon: 'ph:cube-duotone', defaultChildId: 'nuxt:overview' },
      { id: 'nuxt:overview', type: 'iframe', url: '/', title: 'Overview', icon: 'ph:cube-duotone', groupId: 'nuxt' },
      { id: 'nuxt:modules', type: 'iframe', url: '/', title: 'Modules', icon: 'ph:cube-duotone', groupId: 'nuxt' },
    ] satisfies DevframeDockEntry[])
    sharedStates.get('devframe:dock-renderers')!.push({})
    await flushRestore()

    // Without memory the group activation resolves to `defaultChildId`.
    await context.docks.switchEntry('nuxt')
    expect(context.docks.selected?.id).toBe('nuxt:overview')

    // Opening another member records it as the group's last-opened child.
    await context.docks.switchEntry('nuxt:modules')
    expect(session.value.groupLastChildIds).toEqual({ nuxt: 'nuxt:modules' })

    // Closing and re-activating the group reopens the remembered member.
    await context.docks.switchEntry(null)
    expect(context.docks.selected).toBeNull()
    await context.docks.switchEntry('nuxt')
    expect(context.docks.selected?.id).toBe('nuxt:modules')
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
