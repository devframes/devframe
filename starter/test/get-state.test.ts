import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { initDevframe } from 'devframe/initiate'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import devframe from '../src/devframe.ts'

// The public `initDevframe` handler used by every hosted adapter (see
// `@devframes/vite/single`) - a side-car WS server on a free port, no SPA
// (`distDir: false`), so this test exercises `get-state` over the real wire
// without booting the CLI dev server or building the client first.
vi.stubGlobal('WebSocket', WebSocket)

describe('get-state', () => {
  let tmpDir: string
  let instance: ReturnType<typeof initDevframe>
  let rpc: ReturnType<typeof createRpcClient<any, any>>

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'devframe-starter-test-'))
    await writeFile(path.join(tmpDir, 'file1.txt'), '')
    await writeFile(path.join(tmpDir, 'file2.txt'), '')
    await mkdir(path.join(tmpDir, 'dir1'))
    // `get-state` falls back to this env var over `ctx.cwd` so tests
    // control the working directory without touching the real `process.cwd()`.
    process.env.DEVFRAME_E2E_CWD = tmpDir

    instance = initDevframe(devframe, {
      base: devframe.basePath!,
      distDir: false,
      // Explicit IPv4: `host: 'localhost'` (the default) can resolve to the
      // IPv6 loopback on some systems, while the client below dials `127.0.0.1`
      // directly - an address-family mismatch that reads as a silent hang.
      host: '127.0.0.1',
      ws: { sidecar: true },
      // Fine here (unlike the "real" surfaces in `src/devframe.ts` and
      // `playground/`): this instance is a private, ephemeral test fixture
      // - bound to loopback, torn down in `afterAll`, and never reachable
      // by anything but this test process.
      auth: false,
    })
    await instance.ready

    // A side-car binds its WS endpoint at `/<route>` (default `__ws`), so
    // `connectionMeta().websocket` is `{ port, path }` here - not a bare port.
    const wsMeta = instance.connectionMeta().websocket as { port: number, path: string }
    const channel = createWsRpcChannel({ url: `ws://127.0.0.1:${wsMeta.port}/${wsMeta.path}` })
    rpc = createRpcClient({}, { channel })
  })

  afterAll(async () => {
    await instance.close()
    await rm(tmpDir, { recursive: true, force: true })
    delete process.env.DEVFRAME_E2E_CWD
  })

  it('returns runtime info and the working directory listing, sorted with dotfiles excluded', async () => {
    const state = await rpc.$call('devframe-starter:get-state')
    expect(state).toEqual({
      node: process.version,
      cwd: tmpDir,
      items: [
        { name: 'dir1', kind: 'dir' },
        { name: 'file1.txt', kind: 'file' },
        { name: 'file2.txt', kind: 'file' },
      ],
    })
  })
})
