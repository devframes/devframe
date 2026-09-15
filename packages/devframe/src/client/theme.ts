import { DEVFRAME_EVENTS } from '../events'

/** Optional presentation hints supplied by the hub UI provider to a panel. */
export interface DevframeTheme {
  /** CSS color for the panel's primary UI accent. Omitted to use the SPA's default. */
  primaryColor?: string
}

export interface DevframeThemeProvider {
  /** Replace the presentation hints, including clearing a previous accent. */
  update: (theme: DevframeTheme) => void
  /** Remove the message and iframe-load listeners. */
  dispose: () => void
}

const channel = DEVFRAME_EVENTS.postMessage.theme

function isThemeMessage(data: unknown): data is { channel: typeof channel, type: string, theme?: unknown } {
  return typeof data === 'object' && data !== null
    && 'channel' in data && data.channel === channel
    && 'type' in data && typeof data.type === 'string'
}

function isTheme(theme: unknown): theme is DevframeTheme {
  return typeof theme === 'object' && theme !== null
    && (!('primaryColor' in theme) || theme.primaryColor === undefined || typeof theme.primaryColor === 'string')
}

/**
 * Opt a panel into its embedding window's accent hints. Maps no styles itself:
 * the SPA chooses which UI tokens to update. Returns a listener cleanup.
 * Standalone SPAs and server-side rendering keep their own theme.
 */
export function watchDevframeTheme(onChange: (theme: DevframeTheme) => void): () => void {
  if (typeof window === 'undefined' || window.parent === window)
    return () => {}

  const parent = window.parent
  function request() {
    // The request contains no application data. The embedding window may be
    // cross-origin; only that exact window can answer with presentation hints.
    parent.postMessage({ channel, type: 'request' }, '*')
  }
  function onMessage(event: MessageEvent) {
    if (event.source !== parent || !isThemeMessage(event.data))
      return
    if (event.data.type === 'available')
      request()
    else if (event.data.type === 'update' && isTheme(event.data.theme))
      onChange({ primaryColor: event.data.theme.primaryColor })
  }

  window.addEventListener('message', onMessage)
  request()
  return () => window.removeEventListener('message', onMessage)
}

/**
 * Offer accent hints to one iframe. Only a panel calling watchDevframeTheme()
 * receives updates; the hub UI provider never writes into the iframe's DOM.
 * The ready handshake supports either boot order, reloads and cross-origin SPAs.
 */
export function provideDevframeTheme(iframe: HTMLIFrameElement, initial: DevframeTheme): DevframeThemeProvider {
  const ownerWindow = iframe.ownerDocument.defaultView!
  let theme = { primaryColor: initial.primaryColor }
  let subscribedOrigin: string | undefined

  function announce() {
    iframe.contentWindow?.postMessage({ channel, type: 'available' }, '*')
  }
  function publish() {
    if (subscribedOrigin !== undefined)
      iframe.contentWindow?.postMessage({ channel, type: 'update', theme }, subscribedOrigin)
  }
  function onMessage(event: MessageEvent) {
    if (!iframe.contentWindow || event.source !== iframe.contentWindow || !isThemeMessage(event.data))
      return
    if (event.data.type !== 'request' || event.origin === 'null')
      return
    subscribedOrigin = event.origin
    publish()
  }
  function onLoad() {
    // A new document must opt in again, including after an address-bar navigation.
    subscribedOrigin = undefined
    announce()
  }

  ownerWindow.addEventListener('message', onMessage)
  iframe.addEventListener('load', onLoad)
  announce()

  return {
    update(next) {
      theme = { primaryColor: next.primaryColor }
      publish()
    },
    dispose() {
      ownerWindow.removeEventListener('message', onMessage)
      iframe.removeEventListener('load', onLoad)
      subscribedOrigin = undefined
    },
  }
}
