import { onScopeDispose } from 'vue'

export interface HostPage {
  origin: string
  href: () => string
  onNavigate: (listener: (href: string) => void) => void
}

/**
 * The same-origin app page that embeds this frame, or `null`. A hub's floating
 * dock embeds the frame in the app page. The hub's own shell is not an app
 * page: it lives under the hub base, which is the parent path of this frame.
 */
function readHostWindow(): Window | null {
  if (window.parent === window)
    return null
  try {
    const hubBase = new URL('..', location.href).pathname
    return window.parent.location.pathname.startsWith(hubBase) ? null : window.parent
  }
  catch {
    // A cross-origin parent throws on `location` access.
    return null
  }
}

/**
 * Track the app page that embeds this frame. `onNavigate` listeners run on
 * history navigation and, where the Navigation API exists, also on
 * `pushState`, which fires no event of its own. A router that the browser
 * cannot report needs a manual read of `href()`.
 */
export function useHostPage(): HostPage | null {
  const host = readHostWindow()
  if (!host)
    return null

  const listeners = new Set<(href: string) => void>()
  const report = (): void => listeners.forEach(listener => listener(host.location.href))
  host.addEventListener('popstate', report)
  host.addEventListener('hashchange', report)
  host.navigation?.addEventListener('currententrychange', report)
  onScopeDispose(() => {
    host.removeEventListener('popstate', report)
    host.removeEventListener('hashchange', report)
    host.navigation?.removeEventListener('currententrychange', report)
  })

  return {
    origin: host.location.origin,
    href: () => host.location.href,
    onNavigate: listener => listeners.add(listener),
  }
}
