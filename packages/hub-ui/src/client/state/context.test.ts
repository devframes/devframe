import type { DevframeDockEntry } from '@devframes/hub'
import type { DevframeRpcClient, DockSessionStorage } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
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

const groupEntries = [
  { id: 'tools', type: 'group', title: 'Tools', icon: 'ph:wrench-duotone' },
  { id: 'tools:a', type: 'iframe', title: 'A', icon: 'ph:file-duotone', url: '/a', groupId: 'tools' },
  { id: 'tools:b', type: 'iframe', title: 'B', icon: 'ph:file-duotone', url: '/b', groupId: 'tools', category: 'app' },
  { id: 'solo', type: 'group', title: 'Solo', icon: 'ph:circle-duotone' },
  { id: 'solo:only', type: 'iframe', title: 'Only', icon: 'ph:file-duotone', url: '/only', groupId: 'solo' },
  { id: 'defaulted', type: 'group', title: 'Defaulted', icon: 'ph:star-duotone', defaultChildId: 'defaulted:second' },
  { id: 'defaulted:first', type: 'iframe', title: 'First', icon: 'ph:file-duotone', url: '/first', groupId: 'defaulted' },
  { id: 'defaulted:second', type: 'iframe', title: 'Second', icon: 'ph:file-duotone', url: '/second', groupId: 'defaulted' },
  { id: 'empty', type: 'group', title: 'Empty', icon: 'ph:prohibit-duotone' },
] satisfies DevframeDockEntry[]

async function createGroupedContext() {
  const { rpc, sharedStates, trust } = createStubRpc()
  const context = await createDocksContext('embedded', rpc, undefined, ref<DockSessionStorage>({
    open: false,
    selectedDockId: null,
    selectedDockRoute: null,
  }))

  trust()
  sharedStates.get('devframe:docks')!.push(groupEntries)
  sharedStates.get('devframe:dock-renderers')!.push({})
  await flushRestore()

  return context
}

/**
 * Activating a group by id — what a keyboard shortcut and a palette pick both
 * do — must never invent a member for the user.
 */
describe('dock group command activation', () => {
  it('opens the palette scoped to the group when no member is an obvious target', async () => {
    expect.assertions(3)

    const context = await createGroupedContext()
    await context.commands.execute('devframes:docks:tools')

    expect(context.commands.paletteOpen).toBe(true)
    expect(context.commands.paletteScopeId).toBe('devframes:docks:tools')
    // No member was picked on the user's behalf.
    expect(context.docks.selected).toBeNull()
  })

  it('closes that palette again on a second activation while it stays scoped', async () => {
    expect.assertions(1)

    const context = await createGroupedContext()
    await context.commands.execute('devframes:docks:tools')
    await context.commands.execute('devframes:docks:tools')

    expect(context.commands.paletteOpen).toBe(false)
  })

  it('re-scopes instead of closing once the palette has stepped back to the root', async () => {
    expect.assertions(2)

    const context = await createGroupedContext()
    await context.commands.execute('devframes:docks:tools')
    // What the palette does when Escape or Backspace pops the last crumb: the
    // list is still open, but no longer showing the group.
    context.commands.paletteScopeId = null
    await context.commands.execute('devframes:docks:tools')

    expect(context.commands.paletteOpen).toBe(true)
    expect(context.commands.paletteScopeId).toBe('devframes:docks:tools')
  })

  it('opens the sole visible member directly instead of a one-item palette', async () => {
    expect.assertions(2)

    const context = await createGroupedContext()
    await context.commands.execute('devframes:docks:solo')

    expect(context.docks.selected?.id).toBe('solo:only')
    expect(context.commands.paletteOpen).toBe(false)
  })

  it('honors `defaultChildId` over both the palette and member order', async () => {
    expect.assertions(2)

    const context = await createGroupedContext()
    await context.commands.execute('devframes:docks:defaulted')

    expect(context.docks.selected?.id).toBe('defaulted:second')
    expect(context.commands.paletteOpen).toBe(false)
  })

  it('registers no command for a group with nothing to activate', async () => {
    expect.assertions(1)

    const context = await createGroupedContext()

    await expect(context.commands.execute('devframes:docks:empty')).rejects.toThrow(/not found/)
  })

  it('executes a group member command nested below its group', async () => {
    expect.assertions(1)

    const context = await createGroupedContext()
    await context.commands.execute('devframes:docks:tools:b')

    expect(context.docks.selected?.id).toBe('tools:b')
  })

  it('hangs members directly off their group even when sub-categories differ', async () => {
    expect.assertions(1)

    const context = await createGroupedContext()
    const docks = context.commands.commands.find(c => c.id === 'devframes:docks')
    const tools = docks?.children?.find(c => c.id === 'devframes:docks:tools')

    // `tools:a` (default) and `tools:b` (app) land in different in-group
    // sub-categories. The dock bar draws a divider between them; the command
    // tree keeps them siblings, so reaching one is a single step rather than
    // picking an inert category row first.
    expect(tools?.children?.map(c => c.id)).toEqual([
      'devframes:docks:tools:a',
      'devframes:docks:tools:b',
    ])
  })
})
