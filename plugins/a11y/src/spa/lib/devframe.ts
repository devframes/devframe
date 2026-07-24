import type { DevframeConnectionStatus } from 'devframe/client'
import type { Accessor } from 'solid-js'
import type { AgentConfig, Impact } from '../../shared/protocol.ts'
import { connectDevframe } from 'devframe/client'
import { createSignal } from 'solid-js'
import { A11Y_DOCKS_ACTIVE_KEY } from '../../shared/protocol.ts'

export interface ImpactMeta {
  id: Impact
  label: string
  blurb: string
}

export interface A11yConfig {
  channel: string
  nodeAttr: string
  docsBase: string
  /** The devframe id this dock is registered under. */
  dockId: string
  /** Auto-pin all of a route's violations the first time it's scanned. */
  defaultHighlight: boolean
  /** Runtime configuration forwarded to the in-page agent. */
  agent: AgentConfig
  impacts: ImpactMeta[]
}

/** A dock-activation intent the hub mirrors into shared state. */
export interface DockActivation {
  dockId: string
  params?: Record<string, unknown>
}

export interface DevframeState {
  /** `'websocket'` in dev, `'static'` for a baked build, `null` while/if unreachable. */
  backend: Accessor<string | null>
  /**
   * Connection status of the (optional) devframe backend. The panel's core
   * scan loop runs over BroadcastChannel, so this is informational only —
   * surfaced as a tag rather than blocking the UI.
   */
  status: Accessor<DevframeConnectionStatus | null>
  /** Impact taxonomy + runtime config from the `get-config` RPC. */
  config: Accessor<A11yConfig | null>
  /** Latest dock-activation intent targeting this dock (deep-link support). */
  activation: Accessor<DockActivation | null>
}

/**
 * Connect to the devframe backend for supplementary data: the impact legend,
 * the runtime config the panel forwards to the agent, and the dock-activation
 * shared state that powers deep-linking (e.g. a messages-feed entry navigating
 * here). Intentionally non-blocking and failure-tolerant — the panel's core
 * scan loop runs over BroadcastChannel, so the UI stays useful even if the
 * backend is unreachable.
 */
export function connectDevframeState(): DevframeState {
  const [backend, setBackend] = createSignal<string | null>(null)
  const [status, setStatus] = createSignal<DevframeConnectionStatus | null>(null)
  const [config, setConfig] = createSignal<A11yConfig | null>(null)
  const [activation, setActivation] = createSignal<DockActivation | null>(null)

  connectDevframe()
    .then(async (rpc) => {
      setBackend(rpc.connectionMeta.backend)
      setStatus(rpc.status)
      rpc.events.on('connection:status', s => setStatus(s))
      try {
        await rpc.ensureTrusted(2000)
      }
      catch {
        // WS handshake refused/timed out — config is optional, carry on.
      }
      // The server-fn augmentation lives in `src/rpc` (node side); the client
      // bundle doesn't import it, so call by name with a local return type.
      const callConfig = rpc.callOptional as (name: string) => Promise<A11yConfig | undefined>
      const cfg = await callConfig('devframes:plugin:a11y:get-config')
      if (cfg)
        setConfig(cfg)

      // The hub (when present) mirrors dock activations here; used for
      // deep-linking from other docks (e.g. the messages feed).
      try {
        const shared = await rpc.sharedState.get(A11Y_DOCKS_ACTIVE_KEY, {
          initialValue: { activation: null },
        }) as { value: () => { activation: DockActivation | null }, on: (e: string, cb: (v: any) => void) => void }
        const apply = (v: { activation: DockActivation | null } | undefined) => {
          if (v?.activation)
            setActivation({ ...v.activation })
        }
        apply(shared.value())
        shared.on('updated', apply)
      }
      catch {
        // No hub / no shared state — deep-linking simply stays inert.
      }
    })
    .catch(() => {
      // No reachable backend (e.g. agent loaded outside a devframe host).
      setStatus('error')
    })

  return { backend, status, config, activation }
}
