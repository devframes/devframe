import type { DevframeJsonRenderSpec } from '@devframes/json-render'
import type { ActionBridgeRpc } from '@devframes/json-render-ui'
import { JSON_RENDER_UPSTREAM_VERSION } from '@devframes/json-render'
import { JsonRenderView } from '@devframes/json-render-ui'
import { connectDevframe } from 'devframe/client'
import { createApp, h, shallowRef } from 'vue'
import { STATE_KEY } from '../shared.ts'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

// Shared design tokens flip on the `.dark` class; mirror the OS preference.
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

async function main(): Promise<void> {
  const root = document.getElementById('app')
  if (!root)
    throw new Error('#app mount node missing')

  // The app supplies the compatible frontend lib (@devframes/json-render-ui);
  // devframe serves this SPA. Connect, subscribe to the view's shared state,
  // and render — new server snapshots/patches re-render the view live.
  const rpc = await connectDevframe()
  const interactive = rpc.connectionMeta.backend !== 'static'
  const state = await rpc.sharedState.get<DevframeJsonRenderSpec>(STATE_KEY, {
    initialValue: null as unknown as DevframeJsonRenderSpec,
  })

  const specRef = shallowRef<DevframeJsonRenderSpec | null>(state.value() as DevframeJsonRenderSpec | null)
  state.on('updated', () => {
    specRef.value = state.value() as DevframeJsonRenderSpec | null
  })

  createApp({
    render: () => h('div', { class: 'min-h-screen bg-base color-base font-sans p6' }, [
      h(JsonRenderView, {
        spec: specRef.value,
        rpc: rpc as unknown as ActionBridgeRpc,
        viewId: STATE_KEY,
        upstreamVersion: JSON_RENDER_UPSTREAM_VERSION,
        interactive,
      }),
    ]),
  }).mount(root)
}

main().catch((error) => {
  console.error(error)
  document.body.textContent = `Failed to start: ${(error as Error).message}`
})
