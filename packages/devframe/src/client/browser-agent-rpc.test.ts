import type { BrowserAgentClientInfo, BrowserAgentToolManifest } from './browser-agent'
import type { BrowserAgentInvocationDefinition } from './browser-agent-rpc'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerBrowserAgentTool } from './browser-agent'
import { setupBrowserAgentRpcBridge } from './browser-agent-rpc'

describe('browser agent RPC bridge', () => {
  const disposals: (() => void)[] = []
  afterEach(() => disposals.splice(0).forEach(dispose => dispose()))

  it('synchronizes manifests and invokes the original browser tool', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const callOptional = vi.fn().mockResolvedValue(undefined)
    const rpc = {
      client: {
        register(definition: BrowserAgentInvocationDefinition) {
          handlers.set(definition.name, definition.handler)
        },
      },
      callOptional(
        method: 'devframe:agent:sync-client-tools',
        clientId: string,
        tools: BrowserAgentToolManifest[],
        info: BrowserAgentClientInfo,
      ) {
        return callOptional(method, clientId, tools, info)
      },
      events: { on: () => () => {} },
    }

    disposals.push(registerBrowserAgentTool({
      id: 'todos:add',
      description: 'Add a todo.',
      safety: 'action',
      inputSchema: { type: 'object' },
      invoke: args => ({ added: args.text }),
    }))
    disposals.push(setupBrowserAgentRpcBridge(rpc))
    await vi.waitFor(() => expect(callOptional).toHaveBeenCalledWith(
      'devframe:agent:sync-client-tools',
      expect.any(String),
      [{
        id: 'todos:add',
        description: 'Add a todo.',
        safety: 'action',
        inputSchema: { type: 'object' },
      }],
      { url: expect.any(String), title: expect.any(String), visible: expect.any(Boolean), focused: expect.any(Boolean) },
    ))

    await expect(handlers.get('devframe:agent:invoke-client-tool')!(
      'todos:add',
      { text: 'milk' },
    )).resolves.toEqual({ added: 'milk' })
  })

  describe('in a browser document', () => {
    function stubDocument() {
      const doc = Object.assign(new EventTarget(), {
        title: 'Todos',
        location: { href: 'http://localhost:5173/todos' },
        visibilityState: 'visible' as DocumentVisibilityState,
        focused: false,
        hasFocus() {
          return this.focused
        },
      })
      const win = Object.assign(new EventTarget(), { document: doc })
      vi.stubGlobal('window', win)
      vi.stubGlobal('document', doc)
      return { win, doc }
    }
    afterEach(() => vi.unstubAllGlobals())

    function bridge() {
      const callOptional = vi.fn().mockResolvedValue(undefined)
      disposals.push(registerBrowserAgentTool({
        id: 'todos:add',
        description: 'Add a todo.',
        safety: 'action',
        invoke: () => undefined,
      }))
      disposals.push(setupBrowserAgentRpcBridge({
        client: { register() {} },
        callOptional: (...args) => callOptional(...args),
        events: { on: () => () => {} },
      }))
      const lastInfo = () => callOptional.mock.lastCall?.[3]
      return { callOptional, lastInfo }
    }

    it('reports the tab it runs in', async () => {
      stubDocument()
      const { lastInfo } = bridge()
      await vi.waitFor(() => expect(lastInfo()).toEqual({
        url: 'http://localhost:5173/todos',
        title: 'Todos',
        visible: true,
        focused: false,
      }))
    })

    it('re-syncs when the tab gains focus or changes visibility', async () => {
      const { win, doc } = stubDocument()
      const { callOptional, lastInfo } = bridge()
      await vi.waitFor(() => expect(callOptional).toHaveBeenCalledTimes(1))

      doc.focused = true
      win.dispatchEvent(new Event('focus'))
      await vi.waitFor(() => expect(lastInfo()).toMatchObject({ focused: true }))

      doc.focused = false
      doc.visibilityState = 'hidden'
      doc.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(lastInfo()).toMatchObject({ focused: false, visible: false }))
    })
  })
})
