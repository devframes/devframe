import type { DockPanelStorage } from '@devframes/hub/client'
import { getDevframeRpcClient, setDevframeClientContext } from '@devframes/hub/client'
import { useLocalStorage } from '@vueuse/core'
import { HUB_UI_HIDE_EVENT } from '../constants'
import { DEFAULT_DOCK_PANEL_STORE } from '../state/docks'

/**
 * The floating-dock bootstrap the hub serves at `<base>embedded.js` — load
 * it with one `<script type="module" src="<base>embedded.js">` tag and the
 * dock mounts immediately. Always visible by design: visibility policy
 * belongs to whoever authors an embedded entry, and this one's policy is
 * "you asked for devtools, here they are". The "Hide" command removes the
 * dock for the session; a reload brings it back.
 */
let dockEl: HTMLElement | undefined

async function mountDock(): Promise<void> {
  // A mounted frame's SPA runs inside the viewer's iframes on the same
  // origin — never stack a second dock inside them.
  if (window.parent !== window)
    return
  if (dockEl)
    return

  // The hub base is wherever this script was served from: the page origin's
  // copy first (the common same-origin mount), the serving origin second
  // (a host page on another backend loading the script cross-origin).
  //
  // Read import.meta.url through a variable: Vite's lib build rewrites the
  // literal `new URL('...', import.meta.url)` asset pattern (inlining the
  // module as a `data:` URL), which would make the base the data URL instead
  // of the runtime script URL.
  const moduleUrl = import.meta.url
  const baseUrl = new URL('./', moduleUrl)
  const rpc = await getDevframeRpcClient({
    baseURL: [baseUrl.pathname, baseUrl.href],
    // The dock ships its own authorization view; skip devframe's native
    // browser-prompt fallback.
    simpleAuth: false,
  })

  // The hub's aggregated dock-bar preferences (declared by installed
  // devframes), delivered once via the connection handshake we just
  // performed — fixed for the life of this server, never re-fetched.
  const dockConfig = rpc.connectionMeta.configs?.dock

  const defaultStore = DEFAULT_DOCK_PANEL_STORE()
  const state = useLocalStorage<DockPanelStorage>(
    'devframes-dock-state',
    {
      ...defaultStore,
      // Seed a first-run visitor's mode/position from the hub's declared
      // defaults — `useLocalStorage`'s own `mergeDefaults` already limits
      // this to a visitor with no stored preference yet.
      ...(dockConfig?.defaultMode ? { mode: dockConfig.defaultMode } : {}),
      ...(dockConfig?.defaultPosition ? { position: dockConfig.defaultPosition } : {}),
    },
    { mergeDefaults: true },
  )

  // Resolve branding before the dock exists so the primary color and logo are
  // in place on the first paint. Read from `ConnectionMeta.configs.ui.branding`,
  // carried by the connection we just established above.
  const { resolveBranding, applyPrimaryColor } = await import('../state/branding')
  const branding = resolveBranding(rpc.connectionMeta.configs?.ui?.branding)

  const { createDocksContext } = await import('../state/context')
  const context = await createDocksContext('embedded', rpc, state)
  setDevframeClientContext(context)

  const { DockEmbedded } = await import('../components/DockEmbedded')
  dockEl = new DockEmbedded({
    context,
    ...(dockConfig?.maxVisibleItems !== undefined ? { layout: { maxVisibleItems: dockConfig.maxVisibleItems } } : {}),
  }) as unknown as HTMLElement
  // Inline on the host element — beats the generated `:host` ramp defaults and
  // inherits through the shadow tree. The embedded bootstrap never touches the
  // host page's <title>/favicon (it's a guest there).
  applyPrimaryColor(dockEl, branding.primaryColor)
  document.body.appendChild(dockEl)
}

window.addEventListener(HUB_UI_HIDE_EVENT, () => {
  dockEl?.remove()
  dockEl = undefined
})

void mountDock()
