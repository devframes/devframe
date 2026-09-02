import type { DockPanelStorage } from '@devframes/hub/client'
import { getDevframeRpcClient, setDevframeClientContext } from '@devframes/hub/client'
import { useLocalStorage } from '@vueuse/core'
import { watchEffect } from 'vue'
import { isDark } from '../src/client/state/color-mode'
import { DEFAULT_DOCK_PANEL_STORE } from '../src/client/state/docks'

/**
 * The base `hub-plugin.ts` mounts the playground's hub instance at. Kept as
 * an explicit constant (rather than inferred from the page's own URL, like
 * the production `standalone`/`embedded` entries do) because this playground
 * page is served from Vite's own root (`/`), not colocated with the hub the
 * way a built `createUi()` viewer is.
 */
const HUB_BASE = '/__devframes/'

/**
 * `?embedded` mounts the floating `DockEmbedded` bootstrap over the sample
 * host content in `index.html` - the same surface a host page gets from
 * `<script src="<base>embedded.js">`. The default mounts `DockStandalone`
 * full-page - the primary surface most hub-ui changes touch.
 */
const mode = new URLSearchParams(location.search).has('embedded') ? 'embedded' : 'standalone'
document.body.classList.add(mode)

// This page runs in the light DOM, so mirror the color mode onto the
// document element like the standalone viewer does.
watchEffect(() => {
  const el = document.documentElement
  el.classList.toggle('dark', isDark.value)
  el.classList.toggle('light', !isDark.value)
  el.style.colorScheme = isDark.value ? 'dark' : 'light'
})

async function main(): Promise<void> {
  const rpc = await getDevframeRpcClient({ baseURL: HUB_BASE, simpleAuth: false })
  const { createDocksContext } = await import('../src/client/state/context')

  if (mode === 'embedded') {
    const state = useLocalStorage<DockPanelStorage>(
      'devframes-hub-ui-playground-dock-state',
      DEFAULT_DOCK_PANEL_STORE(),
      { mergeDefaults: true },
    )
    const context = await createDocksContext('embedded', rpc, state)
    setDevframeClientContext(context)
    const { DockEmbedded } = await import('../src/client/components/DockEmbedded')
    document.body.appendChild(new DockEmbedded({ context }))
    return
  }

  const context = await createDocksContext('standalone', rpc)
  setDevframeClientContext(context)
  const { DockStandalone } = await import('../src/client/components/DockStandalone')
  document.getElementById('app')!.appendChild(new DockStandalone({ context }))
}

void main()
