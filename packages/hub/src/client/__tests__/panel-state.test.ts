import type { DevframeRpcClient } from 'devframe/client'
import { describe, expect, it, vi } from 'vitest'
import { HUB_EVENTS } from '../../events'
import { reportDockPanelState } from '../panel-state'

describe('reportDockPanelState', () => {
  it('reports the complete panel snapshot through the hub RPC', async () => {
    expect.assertions(1)

    const call = vi.fn(async () => {})
    const rpc = { call } as unknown as DevframeRpcClient

    await reportDockPanelState(rpc, { state: 'open', selectedDockId: 'git' })

    expect(call).toHaveBeenCalledWith(
      HUB_EVENTS.rpc.docksPanelState,
      { state: 'open', selectedDockId: 'git' },
    )
  })
})
