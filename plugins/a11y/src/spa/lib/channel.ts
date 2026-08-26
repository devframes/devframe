import type { Accessor } from 'solid-js'
import type { A11yMessage, A11yState, PageScriptConfig, PinTarget } from '../../shared/protocol.ts'
import { createSignal, onCleanup } from 'solid-js'
import { A11Y_CHANNEL } from '../../shared/protocol.ts'

export interface A11yChannel {
  /** Latest full route → report aggregate, or `null` until the page script reports in. */
  state: Accessor<A11yState | null>
  /** Whether a page script has announced itself on this origin. */
  pageScriptReady: Accessor<boolean>
  /** Whether the page script is mid-scan. */
  scanning: Accessor<boolean>
  /** `location.pathname` currently in view in the host page. */
  activeRoute: Accessor<string | null>
  /** Draw the transient hover-preview ring around a node's element. */
  preview: (node: { id: string, target: string[] }) => void
  /** Clear the transient hover-preview ring. */
  clearPreview: () => void
  /** Replace the pinned (numbered) highlight set drawn in the host page. */
  setPins: (pins: PinTarget[]) => void
  /** Ask the page script to re-run the scan. */
  rescan: () => void
  /** Forward runtime configuration to the page script. */
  sendConfig: (config: PageScriptConfig) => void
  /** Toggle the page script's interaction-driven auto-scan. */
  setAutoScan: (enabled: boolean) => void
  /** Drop one route's tracked history. */
  clearRoute: (route: string) => void
  /** Drop the whole tracked-route history. */
  clearAll: () => void
}

/**
 * Panel half of the in-page channel (a `BroadcastChannel`). Returns reactive accessors
 * that track the page script's aggregate state plus the actions the UI fires on
 * hover/click/rescan.
 */
export function createA11yChannel(): A11yChannel {
  const [state, setState] = createSignal<A11yState | null>(null)
  const [pageScriptReady, setPageScriptReady] = createSignal(false)
  const [scanning, setScanning] = createSignal(false)
  const [activeRoute, setActiveRoute] = createSignal<string | null>(null)

  const channel = new BroadcastChannel(A11Y_CHANNEL)
  const post = (message: A11yMessage) => channel.postMessage(message)

  channel.addEventListener('message', (event: MessageEvent<A11yMessage>) => {
    const message = event.data
    switch (message.type) {
      case 'a11y:page-script-ready':
        setPageScriptReady(true)
        setActiveRoute(message.route)
        // Closes the startup race: if our panel-ready landed before the page script
        // was listening, asking again now pulls down the current state.
        if (!state())
          post({ type: 'a11y:panel-ready' })
        break
      case 'a11y:state':
        setPageScriptReady(true)
        setScanning(false)
        setActiveRoute(message.state.activeRoute)
        setState(message.state)
        break
      case 'a11y:scanning':
        setPageScriptReady(true)
        setActiveRoute(message.route)
        setScanning(true)
        break
    }
  })

  // Announce the panel so a previously-loaded page script replays its current state.
  post({ type: 'a11y:panel-ready' })

  onCleanup(() => channel.close())

  return {
    state,
    pageScriptReady,
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
