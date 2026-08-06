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
  const baseUrl = new URL('./', import.meta.url)
  const rpc = await getDevframeRpcClient({
    baseURL: [baseUrl.pathname, baseUrl.href],
    // The dock ships its own authorization view; skip devframe's native
    // browser-prompt fallback.
    simpleAuth: false,
  })

  const state = useLocalStorage<DockPanelStorage>(
    'devframes-dock-state',
    DEFAULT_DOCK_PANEL_STORE(),
    { mergeDefaults: true },
  )

  const { createDocksContext } = await import('../state/context')
  const context = await createDocksContext('embedded', rpc, state)
  setDevframeClientContext(context)

  const { DockEmbedded } = await import('../components/DockEmbedded')
  dockEl = new DockEmbedded({ context }) as unknown as HTMLElement
  document.body.appendChild(dockEl)
}

window.addEventListener(HUB_UI_HIDE_EVENT, () => {
  dockEl?.remove()
  dockEl = undefined
})

void mountDock()
