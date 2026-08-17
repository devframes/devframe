<script setup lang="ts">
import type { DevframeViewIframe } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { RemoteAssetsErrorMessage } from 'devframe/types'
import type { IframePanes } from 'iframe-pane'
import type { CSSProperties } from 'vue'
import { DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE, REMOTE_CONNECTION_KEY } from '@devframes/hub/constants'
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watchEffect } from 'vue'
import { sharedStateToRef } from '../../state/docks'
import ViewAssetsError from './ViewAssetsError.vue'

const props = defineProps<{
  context: DocksContext
  entry: DevframeViewIframe
  panes: IframePanes
  iframeStyle?: CSSProperties
}>()

function stripRemoteConnectionParam(url: string): string {
  // Remove the remote connection descriptor so the auth token isn't exposed
  // in the address bar (user could accidentally copy it).
  let result = url

  const hashIdx = result.indexOf('#')
  if (hashIdx !== -1) {
    const hash = result.slice(hashIdx + 1)
    const filtered = hash
      .split('&')
      .filter(part => !part.startsWith(`${REMOTE_CONNECTION_KEY}=`))
      .join('&')
    result = filtered ? `${result.slice(0, hashIdx)}#${filtered}` : result.slice(0, hashIdx)
  }

  const qIdx = result.indexOf('?')
  if (qIdx !== -1) {
    const query = result.slice(qIdx + 1)
    const filtered = query
      .split('&')
      .filter(part => !part.startsWith(`${REMOTE_CONNECTION_KEY}=`))
      .join('&')
    result = filtered ? `${result.slice(0, qIdx)}?${filtered}` : result.slice(0, qIdx)
  }

  return result
}

const settings = sharedStateToRef(props.context.docks.settings)
const isEdgeMode = computed(() => props.context.panel.store.mode === 'edge')
const showAddressBar = computed(() => settings.value.showIframeAddressBar ?? true)

const ADDRESS_BAR_HEIGHT = 40

const isLoading = ref(true)
const isIframeLoading = ref(false)
// Flips true once the pane is mounted so the hide/show effect can run — a plain
// `pane.isMounted` read isn't reactive.
const paneReady = ref(false)

// A devframe whose client assets are published as their own npm package
// answers with a fallback page when it can reach neither a local install nor
// the CDN they live on. That page reports itself over `postMessage`, so the
// failure renders as a hub panel — with the install command and a retry —
// rather than as a bare page inside the frame.
const assetsError = ref<RemoteAssetsErrorMessage | null>(null)

// The blank iframe paints white while its content loads, so a placeholder is
// only useful when the pane steps aside (`pane.hide()`) to reveal it — the same
// layering trick `ViewAssetsError` relies on. Show it during the initial load
// and any hard navigation/refresh, but never on top of the assets-error panel.
const showLoadingPlaceholder = computed(
  () => !assetsError.value && (isLoading.value || isIframeLoading.value),
)
const viewFrame = useTemplateRef<HTMLDivElement>('viewFrame')
const urlInputRef = useTemplateRef<HTMLInputElement>('urlInput')

// Address bar state
const currentUrl = ref(props.entry.url)
const editingUrl = ref(props.entry.url)
const isEditing = ref(false)

// Shared-iframe soft navigation: an anchor iframe dock and each of its member
// docks share one `frameId`, so they must render into the *same* live pane.
// Keying on `frameId` (when present) keeps that single iframe alive across
// switches — its navigation/scroll/JS state is preserved and the hub's
// frame-nav adapter soft-navigates it — falling back to the entry id for plain
// iframe docks that own their frame exclusively.
const paneKey = computed(() => props.entry.frameId ?? props.entry.id)

const iframeElement = computed(() => {
  return props.panes.get(paneKey.value)?.iframe
})

// Get current page's origin for comparison
const currentPageOrigin = computed(() => {
  try {
    return window.location.origin
  }
  catch {
    return ''
  }
})

// Check if iframe URL is cross-origin
const isCrossOrigin = computed(() => {
  try {
    const url = new URL(currentUrl.value)
    return url.origin !== currentPageOrigin.value
  }
  catch {
    return true // Assume cross-origin if URL parsing fails
  }
})

// Display URL - hides host if same as current page
const displayUrl = computed(() => {
  const sanitized = stripRemoteConnectionParam(currentUrl.value)
  if (isCrossOrigin.value) {
    return sanitized
  }
  try {
    const url = new URL(sanitized)
    // Show only pathname + search + hash for same-origin
    return url.pathname + url.search + url.hash
  }
  catch {
    return sanitized
  }
})

function updateCurrentUrl() {
  try {
    // Try to get the current URL from the iframe (may fail due to cross-origin)
    const iframe = iframeElement.value
    if (iframe?.contentWindow?.location?.href) {
      currentUrl.value = iframe.contentWindow.location.href
    }
  }
  catch {
    // Cross-origin restriction, keep the last known URL
  }
}

function onWindowMessage(event: MessageEvent) {
  const data = event.data as Partial<RemoteAssetsErrorMessage> | null
  if (typeof data !== 'object' || data === null || data.type !== DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE)
    return
  // Only this view's own frame — a page nested inside it reporting the same
  // failure is that page's business, not this dock's.
  if (event.source !== iframeElement.value?.contentWindow)
    return
  assetsError.value = {
    type: DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE,
    package: String(data.package ?? ''),
    version: String(data.version ?? ''),
    reason: String(data.reason ?? ''),
  }
}

function navigateTo(url: string) {
  const iframe = iframeElement.value
  if (!iframe)
    return

  assetsError.value = null

  // Ensure URL has protocol
  let normalizedUrl = url.trim()
  if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
    // If it starts with /, treat as same-origin path
    if (normalizedUrl.startsWith('/')) {
      normalizedUrl = `${window.location.origin}${normalizedUrl}`
    }
    else {
      normalizedUrl = `http://${normalizedUrl}`
    }
  }

  currentUrl.value = normalizedUrl
  editingUrl.value = normalizedUrl
  iframe.src = normalizedUrl
  isIframeLoading.value = true
}

function handleUrlSubmit() {
  isEditing.value = false
  if (editingUrl.value !== currentUrl.value) {
    navigateTo(editingUrl.value)
  }
}

function handleUrlFocus() {
  isEditing.value = true
  editingUrl.value = currentUrl.value
  nextTick(() => {
    urlInputRef.value?.select()
  })
}

function handleUrlBlur() {
  isEditing.value = false
  editingUrl.value = currentUrl.value
}

function handleUrlKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    isEditing.value = false
    editingUrl.value = currentUrl.value
    urlInputRef.value?.blur()
  }
}

function goBack() {
  try {
    iframeElement.value?.contentWindow?.history.back()
  }
  catch {
    // Cross-origin restriction
  }
}

function refresh() {
  const iframe = iframeElement.value
  if (!iframe)
    return

  assetsError.value = null
  isIframeLoading.value = true
  // Reload by reassigning the src
  const src = iframe.src
  iframe.src = ''
  iframe.src = src
}

let onIframeLoad: (() => void) | undefined

onMounted(() => {
  const existed = props.panes.has(paneKey.value)
  // `src` is only assigned when the pane is first created, so re-mounting an
  // existing iframe (tab switch) preserves its navigation/scroll/JS state. For
  // a shared frame this is also the boot deep-link: the first member (or the
  // anchor) to become visible seeds the src, and every later switch soft-navs.
  const pane = props.panes.ensure(paneKey.value, {
    src: props.entry.url,
    style: { boxShadow: 'none', outline: 'none' },
  })
  const iframe = pane.iframe

  if (existed)
    updateCurrentUrl()
  else
    // A freshly created pane is loading its initial content — reflect it so the
    // placeholder covers the first paint, not just later navigations.
    isIframeLoading.value = true

  // Listen for iframe load events
  onIframeLoad = () => {
    isIframeLoading.value = false
    updateCurrentUrl()
  }
  iframe.addEventListener('load', onIframeLoad)

  const entryState = props.context.docks.getStateById(props.entry.id)
  if (entryState)
    entryState.domElements.iframe = iframe

  // iframe-pane positions the iframe exactly over the mount target (the view
  // frame below the address bar), so no manual offset is needed — only the
  // cosmetic borders differ between edge/float and address-bar states.
  watchEffect(() => {
    Object.assign(iframe.style, props.iframeStyle)
    if (showAddressBar.value && !isEdgeMode.value) {
      iframe.style.borderTopLeftRadius = '0px'
      iframe.style.borderTopRightRadius = '0px'
    }
    else {
      iframe.style.borderTopLeftRadius = ''
      iframe.style.borderTopRightRadius = ''
    }
    if (isEdgeMode.value) {
      iframe.style.borderRadius = '0px'
      iframe.style.border = 'none'
    }
  })

  // The iframe lives in its own layer stacked over this view, so the error
  // panel and the loading placeholder are only visible once the pane steps
  // aside. `hide()` keeps the frame alive (and its state intact) so the content
  // keeps loading behind the placeholder and survives a retry.
  watchEffect(() => {
    if (!paneReady.value)
      return
    if (assetsError.value || isIframeLoading.value)
      pane.hide()
    else
      pane.show()
  })

  window.addEventListener('message', onWindowMessage)

  pane.mount(viewFrame.value!)
  isLoading.value = false
  paneReady.value = true
  nextTick(() => {
    pane.update()
  })
})

onUnmounted(() => {
  window.removeEventListener('message', onWindowMessage)
  const pane = props.panes.get(paneKey.value)
  if (pane && onIframeLoad)
    pane.iframe?.removeEventListener('load', onIframeLoad)
  // Only unmount if this view still owns the pane. When switching between two
  // docks sharing a `frameId`, the incoming view may re-mount the shared pane
  // onto its own container before this outgoing view tears down — unmounting
  // then would wrongly hide the just-revealed iframe. Guarding on the current
  // target makes the handoff order-independent.
  if (pane && pane.target === viewFrame.value)
    pane.unmount()
})
</script>

<template>
  <div class="w-full h-full flex flex-col">
    <div
      v-if="showAddressBar"
      class="flex-none px-2 w-full flex items-center gap-1 border-base border-b"
      :style="{ height: `${ADDRESS_BAR_HEIGHT}px` }"
    >
      <!-- Navigation buttons (hidden for cross-origin) -->
      <template v-if="!isCrossOrigin">
        <!-- Back button -->
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray/15 transition-colors shrink-0"
          title="Back"
          @click="goBack"
        >
          <div class="i-ph-caret-left op60 w-4.5 h-4.5" />
        </button>

        <!-- Refresh button -->
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray/15 transition-colors shrink-0"
          title="Refresh"
          @click="refresh"
        >
          <div class="i-ph-arrow-clockwise op60 w-4.5 h-4.5" />
        </button>
      </template>

      <!-- Cross-origin badge -->
      <div
        v-else
        class="flex items-center gap-1 px2 py1 rounded text-xs bg-amber/10 text-amber border border-amber/20 shrink-0"
        title="Cross-origin iframe - navigation controls unavailable"
      >
        <div class="i-ph-globe text-sm" />
        <span>Cross-Origin</span>
      </div>

      <!-- URL input -->
      <div class="flex-1 flex items-center h-7 px-2.5 rounded bg-gray/5 border border-transparent hover:border-gray/10 focus-within:border-gray/15 transition-colors">
        <input
          ref="urlInput"
          :value="isEditing ? editingUrl : displayUrl"
          type="text"
          class="flex-1 bg-transparent outline-none text-sm font-mono"
          placeholder="Enter URL..."
          :readonly="isCrossOrigin"
          @input="editingUrl = ($event.target as HTMLInputElement).value"
          @focus="handleUrlFocus"
          @blur="handleUrlBlur"
          @keydown="handleUrlKeydown"
          @keydown.enter="handleUrlSubmit"
        >
        <div
          v-if="isIframeLoading"
          class="i-ph-circle-notch text-sm op40 ml-2 shrink-0 animate-spin"
        />
      </div>
    </div>
    <div
      ref="viewFrame"
      class="devframes-view-iframe relative w-full h-full flex-1 items-center justify-center"
    >
      <div
        v-if="showLoadingPlaceholder"
        class="devframes-view-iframe-loading absolute inset-0 flex flex-col items-center justify-center gap-2 bg-base"
      >
        <div class="i-ph:circle-notch-duotone animate-spin text-3xl color-faint" />
        <div class="text-sm color-muted">
          Loading…
        </div>
      </div>
      <ViewAssetsError
        v-if="assetsError"
        :error="assetsError"
        @retry="refresh"
      />
    </div>
  </div>
</template>
