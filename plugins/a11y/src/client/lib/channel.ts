import type { Accessor } from 'solid-js'
import type { A11yMessage, ScanReport, ViolationNode } from '../../shared/protocol.ts'
import { createSignal, onCleanup } from 'solid-js'
import { A11Y_CHANNEL } from '../../shared/protocol.ts'

export interface A11yChannel {
  /** Latest scan report, or `null` until the agent reports in. */
  report: Accessor<ScanReport | null>
  /** Whether an agent has announced itself on this origin. */
  agentReady: Accessor<boolean>
  /** Whether the agent is mid-scan. */
  scanning: Accessor<boolean>
  /** Ask the agent to draw the highlight ring around a node's element. */
  highlight: (node: ViolationNode) => void
  /** Clear any active highlight. */
  clearHighlight: () => void
  /** Ask the agent to re-run the scan. */
  rescan: () => void
}

/**
 * Panel half of the agent↔panel BroadcastChannel. Returns reactive accessors
 * that track the agent's state plus the actions the UI fires on hover/click.
 */
export function createA11yChannel(): A11yChannel {
  const [report, setReport] = createSignal<ScanReport | null>(null)
  const [agentReady, setAgentReady] = createSignal(false)
  const [scanning, setScanning] = createSignal(false)

  const channel = new BroadcastChannel(A11Y_CHANNEL)
  const post = (message: A11yMessage) => channel.postMessage(message)

  channel.addEventListener('message', (event: MessageEvent<A11yMessage>) => {
    const message = event.data
    switch (message.type) {
      case 'a11y:agent-ready':
        setAgentReady(true)
        // Closes the startup race: if our panel-ready landed before the agent
        // was listening, asking again now pulls down the current report.
        if (!report())
          post({ type: 'a11y:panel-ready' })
        break
      case 'a11y:report':
        setAgentReady(true)
        setScanning(false)
        setReport(message.report)
        break
      case 'a11y:scanning':
        setAgentReady(true)
        setScanning(true)
        break
    }
  })

  // Announce the panel so a previously-loaded agent replays its last report.
  post({ type: 'a11y:panel-ready' })

  onCleanup(() => channel.close())

  return {
    report,
    agentReady,
    scanning,
    highlight: node => post({ type: 'a11y:highlight', nodeId: node.id, target: node.target }),
    clearHighlight: () => post({ type: 'a11y:clear' }),
    rescan: () => {
      setScanning(true)
      post({ type: 'a11y:rescan' })
    },
  }
}
