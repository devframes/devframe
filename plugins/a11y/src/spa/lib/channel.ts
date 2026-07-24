import type { Accessor } from 'solid-js'
import type { A11yMessage, A11yState, AgentConfig, PinTarget } from '../../shared/protocol.ts'
import { createSignal, onCleanup } from 'solid-js'
import { A11Y_CHANNEL } from '../../shared/protocol.ts'

export interface A11yChannel {
  /** Latest full route → report aggregate, or `null` until the agent reports in. */
  state: Accessor<A11yState | null>
  /** Whether an agent has announced itself on this origin. */
  agentReady: Accessor<boolean>
  /** Whether the agent is mid-scan. */
  scanning: Accessor<boolean>
  /** `location.pathname` currently in view in the host page. */
  activeRoute: Accessor<string | null>
  /** Draw the transient hover-preview ring around a node's element. */
  preview: (node: { id: string, target: string[] }) => void
  /** Clear the transient hover-preview ring. */
  clearPreview: () => void
  /** Replace the pinned (numbered) highlight set drawn in the host page. */
  setPins: (pins: PinTarget[]) => void
  /** Ask the agent to re-run the scan. */
  rescan: () => void
  /** Forward runtime configuration to the agent. */
  sendConfig: (config: AgentConfig) => void
  /** Toggle the agent's interaction-driven auto-scan. */
  setAutoScan: (enabled: boolean) => void
  /** Drop one route's tracked history. */
  clearRoute: (route: string) => void
  /** Drop the whole tracked-route history. */
  clearAll: () => void
}

/**
 * Panel half of the agent↔panel BroadcastChannel. Returns reactive accessors
 * that track the agent's aggregate state plus the actions the UI fires on
 * hover/click/rescan.
 */
export function createA11yChannel(): A11yChannel {
  const [state, setState] = createSignal<A11yState | null>(null)
  const [agentReady, setAgentReady] = createSignal(false)
  const [scanning, setScanning] = createSignal(false)
  const [activeRoute, setActiveRoute] = createSignal<string | null>(null)

  const channel = new BroadcastChannel(A11Y_CHANNEL)
  const post = (message: A11yMessage) => channel.postMessage(message)

  channel.addEventListener('message', (event: MessageEvent<A11yMessage>) => {
    const message = event.data
    switch (message.type) {
      case 'a11y:agent-ready':
        setAgentReady(true)
        setActiveRoute(message.route)
        // Closes the startup race: if our panel-ready landed before the agent
        // was listening, asking again now pulls down the current state.
        if (!state())
          post({ type: 'a11y:panel-ready' })
        break
      case 'a11y:state':
        setAgentReady(true)
        setScanning(false)
        setActiveRoute(message.state.activeRoute)
        setState(message.state)
        break
      case 'a11y:scanning':
        setAgentReady(true)
        setActiveRoute(message.route)
        setScanning(true)
        break
    }
  })

  // Announce the panel so a previously-loaded agent replays its current state.
  post({ type: 'a11y:panel-ready' })

  onCleanup(() => channel.close())

  return {
    state,
    agentReady,
    scanning,
    activeRoute,
    preview: node => post({ type: 'a11y:highlight', nodeId: node.id, target: node.target }),
    clearPreview: () => post({ type: 'a11y:clear' }),
    setPins: pins => post({ type: 'a11y:pins', pins }),
    rescan: () => {
      setScanning(true)
      post({ type: 'a11y:rescan' })
    },
    sendConfig: config => post({ type: 'a11y:config', config }),
    setAutoScan: enabled => post({ type: 'a11y:set-autoscan', enabled }),
    clearRoute: route => post({ type: 'a11y:clear-route', route }),
    clearAll: () => post({ type: 'a11y:clear-all' }),
  }
}
