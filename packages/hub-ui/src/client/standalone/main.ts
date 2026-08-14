import { getDevframeRpcClient, setDevframeClientContext } from '@devframes/hub/client'
import { watchEffect } from 'vue'
import { applyDocumentHead, applyPrimaryColor, setBranding } from '../state/branding'
import { isDark } from '../state/color-mode'

// The standalone viewer — a vanilla shell served at the hub base itself
// (`DevframeHubUi.viewer`): resolve the shared connection, build the docks
// context, and hand the whole viewport to the DockStandalone element. The
// shell stays frameworkless on purpose; everything visual lives inside the
// custom element's shadow root.

// The viewer page runs in the light DOM, so mirror the color mode onto the
// document element — its background and native controls follow the
// Auto/Light/Dark choice.
watchEffect(() => {
  const el = document.documentElement
  el.classList.toggle('dark', isDark.value)
  el.classList.toggle('light', !isDark.value)
  el.style.colorScheme = isDark.value ? 'dark' : 'light'
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

  const { createDocksContext } = await import('../state/context')
  const context = await createDocksContext('standalone', rpc)
  setDevframeClientContext(context)

  const { DockStandalone } = await import('../components/DockStandalone')
  const el = new DockStandalone({ context }) as unknown as HTMLElement
  applyPrimaryColor(el, branding.primaryColor)
  document.getElementById('app')!.appendChild(el)
}

void main()
