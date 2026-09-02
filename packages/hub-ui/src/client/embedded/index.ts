import type { DockPanelStorage, DockSessionStorage } from '@devframes/hub/client'
import { getDevframeRpcClient, setDevframeClientContext } from '@devframes/hub/client'
import { useLocalStorage, useSessionStorage } from '@vueuse/core'
import { ref } from 'vue'
import { applyPrimaryColor, setBranding } from '../state/branding'
import { DEFAULT_DOCK_PANEL_STORE, DEFAULT_DOCK_SESSION_STORE } from '../state/docks'
import { isEmbeddedDockInitiallyVisible, setupEmbeddedVisibility } from './visibility'

/**
 * The floating-dock bootstrap the hub serves at `<base>embedded.js` - load
 * it with one `<script type="module" src="<base>embedded.js">` tag and the
 * dock mounts itself. Its reveal policy is `ConnectionMeta.configs.ui.embeddedVisibility`
 * (`normal` / `passive` / `hidden`): `normal` shows immediately, the others
 * start hidden and reveal with `Shift+Alt+D`. The "Hide" command conceals the
 * dock; the shortcut (or, for `passive`, a later reload) brings it back.
 */
let dockEl: HTMLElement | undefined

async function mountDock(): Promise<void> {
  // A mounted frame's SPA runs inside the hub UI provider's iframes on the same
  // origin - never stack a second dock inside them.
  if (window.parent !== window)
    return
  if (dockEl)
    return

  // The hub base is wherever this script was served from: page-origin copy
  // first (same-origin mount), serving origin second (cross-origin load). Read
  // `import.meta.url` via a variable so Vite's lib build doesn't rewrite the
  // literal `new URL(..., import.meta.url)` asset pattern into a `data:` URL.
  const moduleUrl = import.meta.url
  const baseUrl = new URL('./', moduleUrl)
  const rpc = await getDevframeRpcClient({
    baseURL: [baseUrl.pathname, baseUrl.href],
    /**
     * The dock ships its own authorization view; skip devframe's native
     * browser-prompt fallback.
     */
    simpleAuth: false,
  })

  // The reference UI's dock-bar preferences (`createUi({ dockPreferences })`),
  // delivered once via the connection handshake we just performed - fixed for
  // the life of this server, never re-fetched.
  const dockPreferences = rpc.connectionMeta.configs?.ui?.dockPreferences

  const defaultStore = DEFAULT_DOCK_PANEL_STORE()
  const state = useLocalStorage<DockPanelStorage>(
    'devframes-dock-state',
    {
      ...defaultStore,
      // Seed a first-run visitor's mode/position from the configured
      // defaults - `useLocalStorage`'s own `mergeDefaults` already limits
      // this to a visitor with no stored preference yet.
      ...(dockPreferences?.defaultMode ? { mode: dockPreferences.defaultMode } : {}),
      ...(dockPreferences?.defaultPosition ? { position: dockPreferences.defaultPosition } : {}),
    },
    { mergeDefaults: true },
  )

  // Per-tab session UI state (open dock + its route). `sessionStorage`, not
  // `localStorage`: selection is per-tab navigation state, so two tabs against
  // the same server keep their own rather than fighting over a shared one. It
  // survives a reload and is restored after the auth handshake.
  const session = useSessionStorage<DockSessionStorage>(
    'devframes-dock-session',
    DEFAULT_DOCK_SESSION_STORE(),
    { mergeDefaults: true },
  )

  // Resolve branding before the dock exists so the primary color and logo are
  // in place on the first paint. Read from `ConnectionMeta.configs.ui.branding`,
  // carried by the connection we just established above.
  const branding = setBranding(rpc.connectionMeta.configs?.ui?.branding || {})

  const embeddedVisibility = rpc.connectionMeta.configs?.ui?.embeddedVisibility ?? 'normal'
  const panelVisible = ref(isEmbeddedDockInitiallyVisible(embeddedVisibility))
  const { createDocksContext } = await import('../state/context')
  const context = await createDocksContext('embedded', rpc, state, session, panelVisible)
  setDevframeClientContext(context)

  const { DockEmbedded } = await import('../components/DockEmbedded')
  dockEl = new DockEmbedded({
    context,
    ...(dockPreferences?.maxVisibleItems !== undefined ? { layout: { maxVisibleItems: dockPreferences.maxVisibleItems } } : {}),
  })
  // Inline on the host element - beats the generated `:host` ramp defaults and
  // inherits through the shadow tree. The embedded bootstrap never touches the
  // host page's <title>/favicon (it's a guest there).
  applyPrimaryColor(dockEl, branding.primaryColor)

  // Reveal policy: `normal` appends now; `passive`/`hidden` wait for the
  // Shift+Alt+D reveal (the element is built and ready, just detached).
  setupEmbeddedVisibility(
    embeddedVisibility,
    branding.productName,
    {
      show: () => {
        if (dockEl && !dockEl.isConnected)
          document.body.appendChild(dockEl)
        panelVisible.value = true
      },
      hide: () => {
        dockEl?.remove()
        panelVisible.value = false
      },
    },
  )
}

void mountDock()
