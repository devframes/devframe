import type {
  CodeServerConnect,
  CodeServerDetection,
  CodeServerServerInfo,
  CodeServerSharedState,
  CodeServerStatusResult,
} from '@devframes/plugin-code-server/client'
import { STATE_KEY } from '@devframes/plugin-code-server/client'
import { computed, onScopeDispose, reactive, ref, shallowRef } from 'vue'
import { useRpc } from './rpc'

/** Discrete UI phases, one per launcher story. */
export type CodeServerPhase = 'connecting' | 'not-installed' | 'launch' | 'starting' | 'running'

const DETECT = 'devframes:plugin:code-server:detect'
const STATUS = 'devframes:plugin:code-server:status'
const START = 'devframes:plugin:code-server:start'
const STOP = 'devframes:plugin:code-server:stop'

/**
 * Live code-server state, driven off the plugin's shared state plus the
 * secret-bearing connect info fetched from the `status` RPC. Exposes the
 * derived {@link CodeServerPhase} and the launch / stop / re-check intents the
 * launcher surfaces.
 */
export function useCodeServer() {
  const rpc = useRpc()

  const detection = reactive<CodeServerDetection>({
    checked: false,
    installed: false,
    bin: 'code-server',
    backend: 'code-server',
    mode: 'local',
  })
  const server = reactive<CodeServerServerInfo>({ status: 'stopped' })
  const connect = shallowRef<CodeServerConnect | undefined>(undefined)
  const busy = ref(false)

  const phase = computed<CodeServerPhase>(() => {
    if (server.status === 'running')
      // Hold on the progress state until the connect handoff arrives, or the
      // editor would load before its cookie/token and show a login page.
      return connect.value ? 'running' : 'starting'
    if (server.status === 'starting' || (busy.value && server.status !== 'error'))
      return 'starting'
    if (!detection.checked)
      return 'connecting'
    if (!detection.installed)
      return 'not-installed'
    return 'launch'
  })

  function applyResult(result: CodeServerStatusResult | undefined): void {
    if (!result)
      return
    Object.assign(detection, result.detection)
    Object.assign(server, result.server)
    if (result.connect)
      connect.value = result.connect
  }

  type LooseCall = (method: string, ...args: unknown[]) => Promise<unknown>

  async function call<T>(method: string, ...args: unknown[]): Promise<T | undefined> {
    const client = rpc.value
    if (!client)
      return undefined
    try {
      return await (client.call as unknown as LooseCall)(method, ...args) as T
    }
    catch (error) {
      server.status = 'error'
      server.error = error instanceof Error ? error.message : String(error)
      return undefined
    }
  }

  async function launch(): Promise<void> {
    if (busy.value)
      return
    busy.value = true
    try {
      applyResult(await call<CodeServerStatusResult>(START, {}))
    }
    finally {
      busy.value = false
    }
  }

  async function stop(): Promise<void> {
    if (busy.value)
      return
    busy.value = true
    try {
      applyResult(await call<CodeServerStatusResult>(STOP))
      connect.value = undefined
    }
    finally {
      busy.value = false
    }
  }

  async function recheck(): Promise<void> {
    if (busy.value)
      return
    busy.value = true
    try {
      await call(DETECT)
    }
    finally {
      busy.value = false
    }
  }

  /** Fetch the initial status and subscribe to live shared-state updates. */
  async function bootstrap(): Promise<void> {
    applyResult(await call<CodeServerStatusResult>(STATUS))

    const client = rpc.value
    if (!client)
      return

    const state = await client.sharedState.get(STATE_KEY, {
      initialValue: { detection, server } as CodeServerSharedState,
    })
    const current = state.value() as CodeServerSharedState
    Object.assign(detection, current.detection)
    Object.assign(server, current.server)

    const off = state.on('updated', (full: CodeServerSharedState) => {
      Object.assign(detection, full.detection)
      Object.assign(server, full.server)
      // Shared state never carries connect material; fetch it once running.
      if (server.status === 'running' && !connect.value) {
        void call<CodeServerStatusResult>(STATUS).then((result) => {
          if (result?.connect)
            connect.value = result.connect
        })
      }
      if (server.status !== 'running')
        connect.value = undefined
    })
    onScopeDispose(() => off?.())
  }

  return { detection, server, connect, busy, phase, launch, stop, recheck, bootstrap }
}
