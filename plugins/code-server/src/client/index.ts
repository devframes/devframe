import type { DevframeRpcClient } from 'devframe/client'
import type {
  CodeServerAuth,
  CodeServerDetection,
  CodeServerServerInfo,
  CodeServerSharedState,
  CodeServerStatusResult,
} from '../types'
import type { CodeServerViewState } from './view'
import { connectDevframe } from 'devframe/client'
import { STATE_KEY } from '../constants'
import { createConnectionState } from './connection-state'
import { createCodeServerView } from './view'

export interface MountCodeServerOptions {
  /** Pre-connected client. When omitted, `connectDevframe()` is awaited. */
  rpc?: DevframeRpcClient
}

export interface CodeServerHandle {
  rpc: DevframeRpcClient
  /** Stop the code-server process (no UI control is rendered over the editor). */
  stop: () => Promise<void>
  dispose: () => void
}

/**
 * Mount the code-server launcher into `container`. Connects to the devframe
 * backend, then drives a {@link createCodeServerView} from the live
 * detection/server state: install instructions when the binary is missing, a
 * launch screen when stopped, a progress state while starting, and the editor
 * in a full-bleed, auto-authenticated iframe once running.
 *
 * The connection is assumed already authorized with devframe's auth, so the
 * server-issued session cookie is applied transparently before the iframe
 * loads — the user never sees code-server's login page.
 */
export async function mountCodeServer(
  container: HTMLElement,
  options: MountCodeServerOptions = {},
): Promise<CodeServerHandle> {
  const rpc = options.rpc ?? (await connectDevframe())
  if (rpc.connectionMeta.backend === 'websocket')
    await rpc.ensureTrusted(5000).catch(() => {})

  // Overlay the launcher with a clear connection state whenever the client
  // isn't connected — a dropped socket or refused auth would otherwise leave
  // an unexplained blank / stale editor. Needs a positioned container.
  if (!container.style.position)
    container.style.position = 'relative'
  const connectionState = createConnectionState(container)
  const syncConnection = (): void => {
    connectionState.update(rpc.status, rpc.connectionError?.message)
  }
  syncConnection()
  const offConnection = rpc.events.on('connection:status', syncConnection)

  let detection: CodeServerDetection = { checked: false, installed: false, bin: 'code-server' }
  let server: CodeServerServerInfo = { status: 'stopped' }
  let auth: CodeServerAuth | undefined
  let busy = false
  let disposed = false

  const view = createCodeServerView(container, {
    actions: { launch, recheck },
  })

  function sync(): void {
    if (disposed)
      return
    view.update({ detection, server, auth, busy } satisfies CodeServerViewState)
  }

  function applyResult(result: CodeServerStatusResult): void {
    detection = result.detection
    server = result.server
    if (result.auth)
      auth = result.auth
  }

  async function call<T>(method: string, ...args: any[]): Promise<T | undefined> {
    try {
      return await rpc.call(method as any, ...args) as T
    }
    catch (error) {
      server = { status: 'error', error: error instanceof Error ? error.message : String(error) }
      return undefined
    }
  }

  async function launch(): Promise<void> {
    if (busy)
      return
    busy = true
    sync()
    const result = await call<CodeServerStatusResult>('devframes:plugin:code-server:start', {})
    if (result)
      applyResult(result)
    busy = false
    sync()
  }

  async function stop(): Promise<void> {
    if (busy)
      return
    busy = true
    sync()
    const result = await call<CodeServerStatusResult>('devframes:plugin:code-server:stop')
    if (result)
      applyResult(result)
    auth = undefined
    busy = false
    sync()
  }

  async function recheck(): Promise<void> {
    if (busy)
      return
    busy = true
    sync()
    await call('devframes:plugin:code-server:detect')
    busy = false
    sync()
  }

  // ---- bootstrap -----------------------------------------------------------

  sync()

  const initial = await call<CodeServerStatusResult>('devframes:plugin:code-server:status')
  if (initial)
    applyResult(initial)
  sync()

  const state = await rpc.sharedState.get(STATE_KEY, {
    initialValue: { detection, server } as CodeServerSharedState,
  })
  const current = state.value() as CodeServerSharedState
  detection = current.detection ?? detection
  server = current.server ?? server

  const off = state.on('updated', (full: CodeServerSharedState) => {
    detection = full.detection ?? detection
    server = full.server ?? server
    // Shared state never carries the cookie; fetch it when the server comes up.
    if (server.status === 'running' && !auth) {
      void call<CodeServerStatusResult>('devframes:plugin:code-server:status').then((result) => {
        if (result?.auth)
          auth = result.auth
        sync()
      })
      return
    }
    sync()
  })
  sync()

  return {
    rpc,
    stop,
    dispose() {
      disposed = true
      off?.()
      offConnection?.()
      connectionState.dispose()
      view.dispose()
    },
  }
}

export { STATE_KEY } from '../constants'
export type { CodeServerServerInfo, CodeServerSharedState, CodeServerStatus } from '../types'
export { createCodeServerView, resolvePhase } from './view'
export type {
  CodeServerPhase,
  CodeServerViewActions,
  CodeServerViewHandle,
  CodeServerViewOptions,
  CodeServerViewState,
} from './view'
