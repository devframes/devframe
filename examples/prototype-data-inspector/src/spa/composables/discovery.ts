/**
 * PROTOTYPE — discovery `ViewModel` lifecycle bound to a Vue container ref.
 * The default page is redefined as a struct view so every result renders
 * through discovery's own page cycle (no DOM races), and the color scheme
 * follows the app's.
 */
import type { Ref, ShallowRef } from 'vue'
import type { ColorScheme } from './scheme'
import { ViewModel } from '@discoveryjs/discovery'
import discoveryCss from '@discoveryjs/discovery/dist/discovery.css?inline'
import { onMounted, onUnmounted, shallowRef, watch } from 'vue'

// Bridge discovery's theme custom props to the design tokens (see style.css
// for the `.di-result-host` values that flip with `.dark`).
const themeBridge = `
  :host {
    --discovery-background-color: var(--di-result-bg);
    --discovery-color: var(--di-result-fg);
    --discovery-page-padding-top: 0;
    --discovery-page-padding-right: 0;
    --discovery-page-padding-bottom: 0;
    --discovery-page-padding-left: 0;
    font-family: var(--font-mono, ui-monospace, monospace);
  }
`

export function useDiscoveryViewer(
  container: Readonly<ShallowRef<HTMLElement | null>>,
  scheme: Ref<ColorScheme>,
  viewConfig: Record<string, unknown> = { view: 'struct', expanded: 2 },
) {
  const host = shallowRef<ViewModel | null>(null)
  let pendingData: { data: unknown } | null = null

  onMounted(async () => {
    if (!container.value)
      return
    const vm = new ViewModel({
      container: container.value,
      styles: [discoveryCss, themeBridge],
      colorScheme: scheme.value,
      colorSchemePersistent: false,
    })
    vm.page.define('default', viewConfig as never)
    await vm.dom.ready
    host.value = vm
    if (pendingData) {
      await vm.setData(pendingData.data, { render: true })
      pendingData = null
    }
  })

  onUnmounted(() => {
    host.value = null
  })

  watch(scheme, (value) => {
    host.value?.colorScheme.set(value)
  })

  async function setData(data: unknown): Promise<void> {
    if (!host.value) {
      pendingData = { data } // render as soon as the host is ready
      return
    }
    await host.value.setData(data, { render: true })
  }

  return { setData }
}
