import type { DevframeDockEntry } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import { HUB_EVENTS } from '@devframes/hub/constants'
import { createEventEmitter } from 'devframe/utils/events'
import { createSharedState } from 'devframe/utils/shared-state'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createDocksContext } from './context'
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
            ? [tracerEntry]
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

function delayActionSetup() {
  let finishImport!: () => void
  const imported = new Promise<void>((resolve) => {
    finishImport = resolve
  })
  const activated = vi.fn()
  vi.mocked(executeSetupScript).mockImplementationOnce(async (_entry, context) => {
    // Vue Tracer attaches its listener only once its client module has loaded.
    await imported
    context.current.events.on('entry:activated', activated)
  })
  return { finishImport, activated }
}

describe('action setup and activation ordering', () => {
  beforeEach(() => {
    vi.mocked(executeSetupScript).mockReset()
  })

  it('delivers the first activation to a listener installed after an async import', async () => {
    const context = await createDocksContext('embedded', createStubRpc())
    const { finishImport, activated } = delayActionSetup()

    const switching = context.docks.switchEntry(tracerEntry.id)
    await nextTick()
    await nextTick()
    expect(executeSetupScript).toHaveBeenCalledOnce()
    expect(activated).not.toHaveBeenCalled()

    finishImport()
    await switching
    await nextTick()

    expect(activated).toHaveBeenCalledOnce()
    expect(context.docks.selected?.id).toBe(tracerEntry.id)
  })

  it.each([null, '~settings'])('preserves navigation to %s while action setup is pending', async (destination) => {
    const context = await createDocksContext('embedded', createStubRpc())
    const { finishImport, activated } = delayActionSetup()

    const switching = context.docks.switchEntry(tracerEntry.id)
    await nextTick()
    await nextTick()
    expect(executeSetupScript).toHaveBeenCalledOnce()
    await context.docks.switchEntry(destination)

    finishImport()
    await switching
    await nextTick()

    expect(activated).not.toHaveBeenCalled()
    expect(context.docks.selected?.id ?? null).toBe(destination)
  })
})
