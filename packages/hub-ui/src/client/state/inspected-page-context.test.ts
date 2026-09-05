import type { DevframeDockEntry } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import type { InspectedPageTarget } from './inspected-page'
import { HUB_EVENTS } from '@devframes/hub/constants'
import { createEventEmitter } from 'devframe/utils/events'
import { createSharedState } from 'devframe/utils/shared-state'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createDocksContext } from './context'
import { connectInspectedPage, installInspectedPageHost } from './inspected-page'
import { fakeWindow } from './inspected-page.test-utils'
import { executeSetupScript } from './setup-script'

vi.mock('./setup-script', () => ({
  executeSetupScript: vi.fn(async () => {}),
}))

const tracerEntry = {
  id: 'vue-tracer',
  type: 'action',
  title: 'Vue Tracer',
  icon: 'ph:cursor-duotone',
  action: { importFrom: '/tracer-client.js' },
} satisfies DevframeDockEntry

const a11yEntry = {
  id: 'a11y',
  type: 'iframe',
  title: 'Accessibility',
  icon: 'ph:person-duotone',
  url: '/a11y/',
  clientScript: { importFrom: '/a11y-client.js' },
} satisfies DevframeDockEntry

const customEntry = {
  id: 'custom',
  type: 'custom-render',
  title: 'Custom renderer',
  icon: 'ph:squares-four-duotone',
  renderer: { importFrom: '/custom-client.js' },
} satisfies DevframeDockEntry

function createStubRpc(): DevframeRpcClient {
  // eslint-disable-next-line slop/no-chained-type-assertions -- this test double supplies the RPC members exercised by createDocksContext.
  return {
    isTrusted: true,
    status: 'connected',
    connectionError: null,
    connectionMeta: { backend: 'live', configs: {} },
    connection: {},
    events: createEventEmitter<any>(),
    sharedState: {
      async get(key: string, options?: { initialValue?: object }) {
        return createSharedState({
          initialValue: key === HUB_EVENTS.sharedState.docks
            ? [tracerEntry, a11yEntry, customEntry]
            : key === HUB_EVENTS.sharedState.dockRenderers
              ? {}
              : options?.initialValue ?? {},
        })
      },
    },
    client: { register: vi.fn() },
    call: vi.fn(),
  } as unknown as DevframeRpcClient
}

function createInspectedPage() {
  const selectionListeners = new Set<(entryId: string | null) => void>()
  const target = {
    prepare: vi.fn(async (_entryId: string) => true),
    activate: vi.fn(async (_entryId: string) => true),
    deactivate: vi.fn(async (_entryId: string) => true),
    onSelection(listener: (entryId: string | null) => void) {
      selectionListeners.add(listener)
      return () => {
        selectionListeners.delete(listener)
      }
    },
    onDisconnect: vi.fn(() => () => {}),
    close: vi.fn(),
  } satisfies InspectedPageTarget
  return {
    target,
    select(entryId: string | null) {
      for (const listener of selectionListeners)
        listener(entryId)
    },
  }
}

function createRemoteContext(target: InspectedPageTarget) {
  return createDocksContext('standalone', createStubRpc(), undefined, undefined, undefined, target)
}

describe('dock scripts in an inspected page', () => {
  beforeEach(() => {
    vi.mocked(executeSetupScript).mockReset()
  })

  it('activates Vue Tracer in the inspected page and selects its dock in the panel', async () => {
    const { target } = createInspectedPage()
    const context = await createRemoteContext(target)

    expect(await context.docks.switchEntry(tracerEntry.id)).toBe(true)

    expect(target.activate).toHaveBeenCalledExactlyOnceWith(tracerEntry.id)
    expect(target.prepare).not.toHaveBeenCalled()
    expect(executeSetupScript).not.toHaveBeenCalled()
    expect(context.docks.selected?.id).toBe(tracerEntry.id)
  })

  it('prepares the A11y page script remotely while selecting its iframe in the panel', async () => {
    const { target } = createInspectedPage()
    const context = await createRemoteContext(target)

    expect(await context.docks.switchEntry(a11yEntry.id)).toBe(true)

    expect(target.prepare).toHaveBeenCalledExactlyOnceWith(a11yEntry.id)
    expect(target.activate).not.toHaveBeenCalled()
    expect(executeSetupScript).not.toHaveBeenCalled()
    expect(context.docks.selected?.id).toBe(a11yEntry.id)
  })

  it('runs a custom renderer in the panel document', async () => {
    const { target } = createInspectedPage()
    const context = await createRemoteContext(target)

    await context.docks.switchEntry(customEntry.id)

    expect(executeSetupScript).toHaveBeenCalledExactlyOnceWith(customEntry, expect.objectContaining({
      current: context.docks.getStateById(customEntry.id),
    }))
    expect(target.activate).not.toHaveBeenCalled()
    expect(target.prepare).not.toHaveBeenCalled()
  })

  it.each(['unavailable', 'disconnected'] as const)('keeps a remote action %s instead of executing it in the panel', async (failure) => {
    const { target } = createInspectedPage()
    const context = await createRemoteContext(target)
    await context.docks.switchEntry('~settings')

    if (failure === 'unavailable') {
      target.activate.mockResolvedValueOnce(false)
      expect(await context.docks.switchEntry(tracerEntry.id)).toBe(false)
    }
    else {
      target.activate.mockRejectedValueOnce(new Error('The inspected page disconnected.'))
      await expect(context.docks.switchEntry(tracerEntry.id)).rejects.toThrow('disconnected')
    }

    expect(context.docks.selected?.id).toBe('~settings')
    expect(executeSetupScript).not.toHaveBeenCalled()
  })

  it.each(['unavailable', 'disconnected'] as const)('reports an A11y page script that is %s without scanning the panel', async (failure) => {
    const { target } = createInspectedPage()
    const context = await createRemoteContext(target)
    if (failure === 'unavailable')
      target.prepare.mockResolvedValueOnce(false)
    else
      target.prepare.mockRejectedValueOnce(new Error('The inspected page disconnected.'))

    await expect(context.docks.switchEntry(a11yEntry.id)).rejects.toThrow()

    expect(executeSetupScript).not.toHaveBeenCalled()
    expect(target.activate).not.toHaveBeenCalled()
  })

  it.each([null, 'a11y'])('deactivates the inspected-page action when navigating to %s', async (destination) => {
    const { target } = createInspectedPage()
    const context = await createRemoteContext(target)
    await context.docks.switchEntry(tracerEntry.id)

    await context.docks.switchEntry(destination)

    expect(target.deactivate).toHaveBeenCalledExactlyOnceWith(tracerEntry.id)
    expect(context.docks.selected?.id ?? null).toBe(destination)
    expect(executeSetupScript).not.toHaveBeenCalled()
  })

  it('clears the panel action when inspection ends in the inspected page', async () => {
    const { target, select } = createInspectedPage()
    const context = await createRemoteContext(target)
    await context.docks.switchEntry(tracerEntry.id)

    select(null)
    await nextTick()

    expect(context.docks.selected).toBeNull()
    expect(context.panel.state.state).toBe('closed')
    expect(target.deactivate).not.toHaveBeenCalled()
  })

  it('deactivates the inspected-page action when the Escape close command runs', async () => {
    const { target } = createInspectedPage()
    const context = await createRemoteContext(target)
    await context.docks.switchEntry(tracerEntry.id)

    expect(context.commands.getKeybindings('devframes:close-panel')).toContainEqual({ key: 'Escape' })
    await context.commands.execute('devframes:close-panel')

    expect(target.deactivate).toHaveBeenCalledExactlyOnceWith(tracerEntry.id)
    expect(context.docks.selected).toBeNull()
    expect(context.panel.state.state).toBe('closed')
  })

  it('keeps the A11y iframe open when the inspected page has no active action', async () => {
    const { target, select } = createInspectedPage()
    const context = await createRemoteContext(target)
    await context.docks.switchEntry(a11yEntry.id)

    select(null)
    await nextTick()

    expect(context.docks.selected?.id).toBe(a11yEntry.id)
    expect(context.panel.state.state).toBe('open')
  })

  it('allows another activation after a page script fails to load', async () => {
    const { target } = createInspectedPage()
    const context = await createRemoteContext(target)
    target.activate.mockRejectedValueOnce(new Error('The page script failed to load.'))

    await expect(context.docks.switchEntry(tracerEntry.id)).rejects.toThrow('failed to load')
    await expect(context.docks.switchEntry(tracerEntry.id)).resolves.toBe(true)

    expect(target.activate).toHaveBeenCalledTimes(2)
    expect(context.docks.selected?.id).toBe(tracerEntry.id)
  })

  it.each([true, false])('cleans up a pending activation before returning to Tracer: %s', async (returnToTracer) => {
    const extension = fakeWindow('chrome-extension://test')
    const panel = fakeWindow('https://app.test', '?devframe-inspected-page=session-a&devframe-parent-origin=chrome-extension%3A%2F%2Ftest')
    const page = fakeWindow()
    panel.win.parent = extension.window
    extension.win.sender = panel.window
    extension.win.addEventListener('message', event => page.win.dispatch('message', {
      data: event.data,
      origin: page.win.location.origin,
      source: page.window,
      ports: event.ports,
    }))

    let finishImport!: () => void
    const imported = new Promise<void>((resolve) => {
      finishImport = resolve
    })
    const selectionListeners = new Set<(id: string | null) => void>()
    let activeEntry: string | null = null
    const select = (id: string | null) => {
      activeEntry = id
      for (const listener of selectionListeners)
        listener(id)
    }
    const host = {
      prepare: async () => true,
      activate: vi.fn(async (id: string) => {
        await imported
        select(id)
        return true
      }),
      deactivate: async () => {
        select(null)
        return true
      },
      onSelection(listener: (id: string | null) => void) {
        selectionListeners.add(listener)
        return () => selectionListeners.delete(listener)
      },
    }
    const stopHost = installInspectedPageHost(host, page.window)
    let target: InspectedPageTarget | undefined
    try {
      target = await connectInspectedPage(panel.window)
      const context = await createRemoteContext(target!)
      const first = context.docks.switchEntry(tracerEntry.id)
      await vi.waitFor(() => expect(host.activate).toHaveBeenCalledOnce())
      await context.docks.switchEntry('~settings')
      const latest = returnToTracer ? context.docks.switchEntry(tracerEntry.id) : undefined

      finishImport()
      await Promise.all([first, latest])
      await nextTick()

      expect(activeEntry).toBe(returnToTracer ? tracerEntry.id : null)
      expect(context.docks.selected?.id).toBe(returnToTracer ? tracerEntry.id : '~settings')
    }
    finally {
      finishImport()
      target?.close()
      stopHost()
    }
  })
})
