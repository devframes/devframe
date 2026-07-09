import type { DevframeHost, DevframeNodeContext, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from 'devframe/types'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'get-port-please'
import { describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { createHostContext } from '../context'
import { startHttpAndWs } from '../server'

function makeHost(storageDir: string): DevframeHost {
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost',
    getStorageDir: () => storageDir,
  }
}

async function createTestContext(): Promise<DevframeNodeContext> {
  const storageDir = mkdtempSync(join(tmpdir(), 'devframe-server-'))
  return createHostContext({ cwd: storageDir, mode: 'dev', host: makeHost(storageDir) })
}

function connectClient(host: string, port: number) {
  return createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
    {} as DevframeRpcClientFunctions,
    { channel: createWsRpcChannel({ url: `ws://${host}:${port}` }) },
  )
}

describe('startHttpAndWs rpcOptions passthrough', () => {
  it('forwards a thrown handler error to rpcOptions.onFunctionError without swallowing the response', async () => {
    const context = await createTestContext()
    context.rpc.register({
      name: 'test:boom',
      type: 'action',
      handler: () => {
        throw new Error('kaboom')
      },
    })

    const onFunctionError = vi.fn()
    const host = '127.0.0.1'
    const port = await getPort({ port: 0, host })
    const server = await startHttpAndWs({
      context,
      host,
      port,
      auth: false,
      rpcOptions: { onFunctionError },
    })

    try {
      const client = connectClient(host, port)
      await expect(client.$call('test:boom' as any)).rejects.toThrow('kaboom')

      expect(onFunctionError).toHaveBeenCalledTimes(1)
      const [error, name] = onFunctionError.mock.calls[0]!
      expect(name).toBe('test:boom')
      expect((error as Error).message).toBe('kaboom')
      client.$close()
    }
    finally {
      await server.close()
    }
  })

  it('forwards a deserialize failure to rpcOptions.onGeneralError', async () => {
    const context = await createTestContext()
    // Returning `true` tells birpc the error was handled, suppressing its
    // default rethrow — matches how a "log and swallow" host would use this.
    const onGeneralError = vi.fn(() => true)
    const host = '127.0.0.1'
    const port = await getPort({ port: 0, host })
    const server = await startHttpAndWs({
      context,
      host,
      port,
      auth: false,
      rpcOptions: { onGeneralError },
    })

    try {
      const raw = new WebSocket(`ws://${host}:${port}`)
      await new Promise<void>((resolve, reject) => {
        raw.once('open', () => resolve())
        raw.once('error', reject)
      })
      raw.send('not valid json and not structured-clone either')

      await vi.waitFor(() => {
        expect(onGeneralError).toHaveBeenCalledTimes(1)
      })
      raw.close()
    }
    finally {
      await server.close()
    }
  })
})
