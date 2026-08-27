import type { DockSessionStorage } from '@devframes/hub/client'
import { getDevframeRpcClient, setDevframeClientContext } from '@devframes/hub/client'
import { useSessionStorage } from '@vueuse/core'
import { watchEffect } from 'vue'
import { applyDocumentHead, applyPrimaryColor, setBranding, useBrandingBackground } from '../state/branding'
import { isDark } from '../state/color-mode'
import { DEFAULT_DOCK_SESSION_STORE } from '../state/docks'

// The standalone viewer — a vanilla shell served at the hub base itself
// (`DevframeHubUi.viewer`): resolve the shared connection, build the docks
// context, and hand the whole viewport to the DockStandalone element. The
// shell stays frameworkless on purpose; everything visual lives inside the
// custom element's shadow root.

// The standalone viewer runs in the light DOM, so mirror the color mode onto the
// document element — its background follows the Auto/Light/Dark choice. The
// component tree carries `color-scheme` for its native controls; keeping that
// off the document lets custom backgrounds composite with the host page.
const brandingBackground = useBrandingBackground()

watchEffect(() => {
  const el = document.documentElement
  el.classList.toggle('dark', isDark.value)
  el.classList.toggle('light', !isDark.value)

  const background = brandingBackground.value
  const hasValidBackground = background !== undefined && CSS.supports('background', background)
  el.classList.toggle('viewer-background-custom', hasValidBackground)
  if (hasValidBackground)
    el.style.setProperty('--devframes-viewer-background', background)
  else
    el.style.removeProperty('--devframes-viewer-background')
})

async function main(): Promise<void> {
  // Served at the hub base with relative assets: `./__connection.json`
  // resolves against the page URL first, the module URL second. Read
  // import.meta.url through a variable so Vite's build doesn't rewrite the
  // literal `new URL('...', import.meta.url)` asset pattern into a data URL.
  const moduleUrl = import.meta.url
  const rpc = await getDevframeRpcClient({
    baseURL: ['./', new URL('./', moduleUrl).href],
    simpleAuth: false,
  })

  // Resolve branding before mount; the standalone page owns its own head, so
  // apply title/favicon/description here too. Read from
  // `ConnectionMeta.configs.ui.branding`, carried by the connection we just
  // established above.
  const branding = setBranding(rpc.connectionMeta.configs?.ui?.branding || {})
  applyDocumentHead(document, branding)

  // Per-tab session UI state (which dock is open + its route). `sessionStorage`
  // so a reload restores the selection after the auth handshake, per-tab.
  const session = useSessionStorage<DockSessionStorage>(
    'devframes-dock-session',
    DEFAULT_DOCK_SESSION_STORE(),
    { mergeDefaults: true },
  )

  const { createDocksContext } = await import('../state/context')
  const context = await createDocksContext('standalone', rpc, undefined, session)
  setDevframeClientContext(context)

  const { DockStandalone } = await import('../components/DockStandalone')
  const el = new DockStandalone({ context }) as unknown as HTMLElement
  applyPrimaryColor(el, branding.primaryColor)
  document.getElementById('app')!.appendChild(el)
}

void main()
