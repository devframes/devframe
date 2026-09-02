import type { Accessor } from 'solid-js'
import type { A11yChannelProtocol, A11yState, PageScriptConfig, PinTarget } from '../../shared/protocol.ts'
import { connectPanelChannel } from 'devframe/in-page-channel'
import { createSignal, onCleanup } from 'solid-js'
import { A11Y_CHANNEL } from '../../shared/protocol.ts'

export interface A11yChannel {
  /** Latest full route → report aggregate, or `null` until the page script reports in. */
  state: Accessor<A11yState | null>
  /** Whether a page script is connected on the in-page channel. */
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
 * Panel half of the a11y in-page channel (`devframe/in-page-channel`).
 * Returns reactive accessors that mirror the page script's authoritative
 * {@link A11yState} plus the actions the UI fires on hover/click/rescan.
 *
 * Connection handling is the channel's job: the handshake retries until a
 * page script answers (it may load after the panel), actions fired while
 * `connecting` are buffered, and a page-script reload re-handshakes and
 * re-seeds the state automatically. Until then `pageScriptReady` stays
 * `false` and `state` stays `null` - the UI renders its fallback from those.
 */
export function createA11yChannel(): A11yChannel {
  const [state, setState] = createSignal<A11yState | null>(null)
  const [pageScriptReady, setPageScriptReady] = createSignal(false)
  // Optimistic scanning flag so the UI reacts to `rescan` immediately; the
  // authoritative flag inside `A11yState` takes over on the next update.
  const [localScanning, setLocalScanning] = createSignal(false)

  const channel = connectPanelChannel<A11yChannelProtocol>({
    name: A11Y_CHANNEL,
    functions: {},
  })
  channel.events.on('status:updated', status => setPageScriptReady(status === 'connected'))

  void channel.sharedState.get('state').then((shared) => {
    const apply = (value: A11yState): void => {
      setLocalScanning(false)
      setState({ ...value })
    }
    apply(shared.value() as A11yState)
    shared.on('updated', fullState => apply(fullState as A11yState))
  })

  onCleanup(() => channel.close())

  return {
    state,
    pageScriptReady,
    scanning: () => state()?.scanning || localScanning(),
    activeRoute: () => state()?.activeRoute ?? null,
    preview: node => channel.callEvent('highlight', node.id, node.target),
    clearPreview: () => channel.callEvent('clear-highlight'),
    setPins: pins => channel.callEvent('set-pins', pins),
    rescan: () => {
      setLocalScanning(true)
      channel.callEvent('rescan')
    },
    sendConfig: config => channel.callEvent('set-config', config),
    setAutoScan: enabled => channel.callEvent('set-autoscan', enabled),
    clearRoute: route => channel.callEvent('clear-route', route),
    clearAll: () => channel.callEvent('clear-all'),
  }
}
