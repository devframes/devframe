import type { DevframeConnectionStatus } from 'devframe/client'
import type { Accessor } from 'solid-js'
import type { Impact } from '../../shared/protocol.ts'
import { connectDevframe } from 'devframe/client'
import { createSignal } from 'solid-js'

export interface ImpactMeta {
  id: Impact
  label: string
  blurb: string
}

export interface A11yConfig {
  channel: string
  nodeAttr: string
  docsBase: string
  impacts: ImpactMeta[]
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
  /** Impact taxonomy + copy from the `get-config` RPC. */
  config: Accessor<A11yConfig | null>
}

/**
 * Connect to the devframe backend for supplementary data (the impact legend).
 * Intentionally non-blocking and failure-tolerant: the panel's core scan loop
 * runs over BroadcastChannel, so the UI stays useful even if the backend is
 * unreachable.
 */
export function connectDevframeState(): DevframeState {
  const [backend, setBackend] = createSignal<string | null>(null)
  const [status, setStatus] = createSignal<DevframeConnectionStatus | null>(null)
  const [config, setConfig] = createSignal<A11yConfig | null>(null)

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
      const cfg = await callConfig('devframe-a11y-inspector:get-config')
      if (cfg)
        setConfig(cfg)
    })
    .catch(() => {
      // No reachable backend (e.g. agent loaded outside a devframe host).
      setStatus('error')
    })

  return { backend, status, config }
}
