/**
 * Live location tracking for an iframe dock.
 *
 * An iframe dock's address bar (and the route persisted from it into
 * `DockSessionStorage.selectedDockRoute`) has to follow wherever the embedded
 * app actually goes. The `load` event only covers whole-document navigations, so
 * an SPA router moving between routes with `history.pushState()` leaves both
 * showing the URL the frame booted with.
 *
 * {@link watchFrameLocation} closes that gap for a same-origin frame, reporting
 * `location.href` on every navigation it can observe:
 *
 * - `popstate` / `hashchange`: back/forward and hash routing;
 * - `history.pushState`/`replaceState`, wrapped in place (and restored on
 *   dispose) because those two fire no event of their own;
 * - the [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API)'s
 *   `currententrychange` where it exists, which reports post-commit and so also
 *   catches what a wrapper structurally cannot: a router holding a reference to
 *   `pushState` captured before this watch attached;
 * - `load`, which also re-subscribes: a document navigation swaps the frame's
 *   `history`/`navigation` objects, so the previous subscription dies with them.
 *
 * These sources overlap deliberately rather than being chosen between, since a
 * report is deduped against the last href, so the cost of hearing the same
 * navigation twice is nothing, and the cost of missing one is a stale route.
 *
 * A cross-origin frame reports nothing, because its location is unreadable by design,
 * so the caller keeps the last URL it knew.
 */

/** The minimal `history` surface the watcher wraps. Injectable for tests. */
export interface FrameLocationHistory {
  pushState: (...args: any[]) => void
  replaceState: (...args: any[]) => void
}

/** The minimal frame-window surface the watcher reads and subscribes to. */
export interface FrameLocationWindow {
  readonly location: { readonly href: string }
  readonly history?: FrameLocationHistory
  /** Present only where the Navigation API ships. */
  readonly navigation?: {
    addEventListener: (type: 'currententrychange', listener: () => void) => void
    removeEventListener: (type: 'currententrychange', listener: () => void) => void
  }
  addEventListener: (type: 'popstate' | 'hashchange', listener: () => void) => void
  removeEventListener: (type: 'popstate' | 'hashchange', listener: () => void) => void
}

/** The minimal iframe surface the watcher needs. Injectable for tests. */
export interface FrameLocationTarget {
  readonly contentWindow: FrameLocationWindow | null
  addEventListener: (type: 'load', listener: () => void) => void
  removeEventListener: (type: 'load', listener: () => void) => void
}

export interface WatchFrameLocationOptions {
  /** The live iframe whose location is tracked. */
  iframe: FrameLocationTarget
  /** Called with the frame's `location.href` on each observed change. */
  onChange: (href: string) => void
  /**
   * The href the caller already shows, so an initial report is only made when
   * the frame is somewhere else (a frame re-attached mid-session, say).
   */
  initial?: string
}

/**
 * Track a frame's location until the returned disposer is called. Disposing
 * detaches every listener and restores any wrapped `history` method, leaving the
 * embedded page as it was found.
 */
export function watchFrameLocation(options: WatchFrameLocationOptions): () => void {
  const { iframe, onChange } = options
  let lastReported = options.initial
  let detach: (() => void) | undefined
  let disposed = false

  /**
   * The frame's window, or `null` when its location can't be read. Touching
   * `location.href` is the cross-origin probe, since it throws for a foreign
   * document, where there is nothing to observe.
   */
  function readableWindow(): FrameLocationWindow | null {
    try {
      const win = iframe.contentWindow
      return win && typeof win.location.href === 'string' ? win : null
    }
    catch {
      return null
    }
  }

  function report(): void {
    const href = readableWindow()?.location.href
    // `about:blank` is the placeholder document a fresh iframe holds until its
    // `src` commits; reporting it would overwrite the real route with a blank.
    if (!href || href === 'about:blank' || href === lastReported)
      return
    lastReported = href
    onChange(href)
  }

  function subscribe(): void {
    const win = readableWindow()
    if (!win)
      return
    const listeners: (() => void)[] = []

    win.addEventListener('popstate', report)
    win.addEventListener('hashchange', report)
    listeners.push(() => {
      win.removeEventListener('popstate', report)
      win.removeEventListener('hashchange', report)
    })

    const { navigation, history } = win
    if (navigation) {
      navigation.addEventListener('currententrychange', report)
      listeners.push(() => navigation.removeEventListener('currententrychange', report))
    }
    if (history) {
      // Wrap rather than replace: the original still does the navigating, and
      // goes back onto the object untouched when this watcher is disposed.
      const originals = { pushState: history.pushState, replaceState: history.replaceState }
      for (const method of ['pushState', 'replaceState'] as const) {
        history[method] = function (this: unknown, ...args: any[]): void {
          originals[method].apply(this, args)
          report()
        }
      }
      listeners.push(() => {
        history.pushState = originals.pushState
        history.replaceState = originals.replaceState
      })
    }

    detach = () => {
      for (const off of listeners) off()
    }
  }

  function onLoad(): void {
    if (disposed)
      return
    detach?.()
    detach = undefined
    subscribe()
    report()
  }

  iframe.addEventListener('load', onLoad)
  subscribe()
  report()

  return () => {
    if (disposed)
      return
    disposed = true
    iframe.removeEventListener('load', onLoad)
    detach?.()
    detach = undefined
  }
}
