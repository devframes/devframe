<script setup lang="ts">
import type { DevframeDockEntry } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { JsonRenderViewRef } from '@devframes/json-render'
import type { IframePanes } from 'iframe-pane'
import type { CSSProperties } from 'vue'
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'
import { useViewProviders } from '../../state/view-providers'

// Renders a provider-backed dock view (e.g. `json-render`) in a chromeless
// iframe pointed at the registered provider SPA — decoupling the renderer from
// this UI's framework. The dock's view travels as `?view=<stateKey>`; an inline
// spec is first materialized into an ephemeral shared-state key. When no
// provider is registered for the type, a placeholder explains how to add one.
const props = defineProps<{
  context: DocksContext
  entry: DevframeDockEntry
  panes: IframePanes
  iframeStyle?: CSSProperties
}>()

const providers = useViewProviders(props.context.rpc)
const providerBase = computed(() => providers.value[props.entry.type]?.base)

// The stateKey the provider SPA renders. A json-render entry carries a
// serializable `view` ref: a live shared-state key, or an inline spec we
// materialize into an ephemeral key the iframe can read over the shared socket.
const viewKey = shallowRef<string | undefined>()

async function resolveViewKey(): Promise<void> {
  const view = (props.entry as { view?: JsonRenderViewRef }).view
  if (!view) {
    viewKey.value = undefined
    return
  }
  if ('stateKey' in view) {
    viewKey.value = view.stateKey
    return
  }
  const key = `devframe:json-render:inline:${props.entry.id}`
  const state = await props.context.rpc.sharedState.get(key, { initialValue: null })
  state.mutate(() => view.spec)
  viewKey.value = key
}

const src = computed(() => {
  const base = providerBase.value
  if (!base)
    return undefined
  return viewKey.value ? `${base}?view=${encodeURIComponent(viewKey.value)}` : base
})

// One pooled iframe per (provider type + view): preserved across tab switches,
// reused when reselected.
const paneKey = computed(() => `viewprovider:${props.entry.type}:${viewKey.value ?? props.entry.id}`)
const viewFrame = useTemplateRef<HTMLDivElement>('viewFrame')

let mountedKey: string | undefined
function mountPane(): void {
  const source = src.value
  const target = viewFrame.value
  if (!source || !target)
    return
  const key = paneKey.value
  const pane = props.panes.ensure(key, {
    src: source,
    style: { boxShadow: 'none', outline: 'none' },
  })
  Object.assign(pane.iframe.style, props.iframeStyle)
  const entryState = props.context.docks.getStateById(props.entry.id)
  if (entryState)
    entryState.domElements.iframe = pane.iframe
  pane.mount(target)
  pane.update()
  mountedKey = key
}

onMounted(() => void resolveViewKey())
watch(() => (props.entry as { view?: JsonRenderViewRef }).view, () => void resolveViewKey())
// Mount (or re-point) once the provider base + view are resolved.
watchEffect(() => {
  if (src.value && viewFrame.value)
    mountPane()
})

onUnmounted(() => {
  if (!mountedKey)
    return
  const pane = props.panes.get(mountedKey)
  // Only unmount if this view still owns the pane (guards the shared handoff).
  if (pane && pane.target === viewFrame.value)
    pane.unmount()
})
</script>

<template>
  <div
    v-if="providerBase"
    ref="viewFrame"
    class="devframes-view-provider w-full h-full"
  />
  <div
    v-else
    class="w-full h-full flex flex-col items-center justify-center gap-2 p6 text-center color-muted select-none"
  >
    <div class="i-ph:puzzle-piece-duotone text-3xl op40" />
    <div class="text-sm color-base">
      No <span class="font-mono">{{ entry.type }}</span> view provider registered
    </div>
    <p class="text-xs op-fade max-w-80 leading-relaxed">
      This host renders <span class="font-mono">{{ entry.type }}</span> views through a provider.
      Register one (e.g. <span class="font-mono">@devframes/json-render-ui</span>) via
      <span class="font-mono">initHub({ viewProviders })</span>.
    </p>
  </div>
</template>
