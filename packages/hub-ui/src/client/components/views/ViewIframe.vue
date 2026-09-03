<script setup lang="ts">
import type { DevframeViewIframe } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { RemoteAssetsErrorMessage } from 'devframe/types'
import type { IframePanes } from 'iframe-pane'
import type { CSSProperties } from 'vue'
import { stripRemoteConnectionFromUrl, watchFrameLocation } from '@devframes/hub/client'
import { DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE } from '@devframes/hub/constants'
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watchEffect } from 'vue'
import { useSettings } from '../../state/settings-defaults'
import ViewAssetsError from './ViewAssetsError.vue'
import ViewIframeLoading from './ViewIframeLoading.vue'

const props = defineProps<{
  context: DocksContext
  entry: DevframeViewIframe
  panes: IframePanes
  iframeStyle?: CSSProperties
}>()

const settings = useSettings(props.context)
const isEdgeMode = computed(() => props.context.panel.store.mode === 'edge')
const addressBarControls = computed(() => typeof props.entry.addressBar === 'object' ? props.entry.addressBar : undefined)
const showAddressBar = computed(() => settings.value.showIframeAddressBar || Boolean(props.entry.addressBar))

const ADDRESS_BAR_HEIGHT = 40

const isLoading = ref(true)
const isIframeLoading = ref(false)
// Flips true once the pane is mounted so the hide/show effect can run; a plain
// `pane.isMounted` read isn't reactive.
const paneReady = ref(false)

// A devframe whose client assets are published as their own npm package
// answers with a fallback page when it can reach neither a local install nor
// the CDN they live on. That page reports itself over `postMessage`, so the
// failure renders as a hub panel (with the install command and a retry)
// rather than as a bare page inside the frame.
const assetsError = ref<RemoteAssetsErrorMessage | null>(null)

// The blank iframe paints white while its content loads, so a placeholder is
// only useful when the pane steps aside (`pane.hide()`) to reveal it, the same
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
// switches, so its navigation/scroll/JS state is preserved and the hub's
// frame-nav adapter soft-navigates it, falling back to the entry id for plain
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
    return new URL(currentUrl.value).origin !== currentPageOrigin.value
  }
  catch {
    return true // Assume cross-origin if URL parsing fails
  }
})
const showBack = computed(() => addressBarControls.value?.back ?? !isCrossOrigin.value)
const showReload = computed(() => addressBarControls.value?.reload ?? !isCrossOrigin.value)
const showOpenExternal = computed(() => addressBarControls.value?.openExternal ?? false)

// Display URL - hides host if same as current page. The remote connection
// descriptor is stripped so its auth token can't be read (or copied) out of the
// address bar; the route persisted for a reload keeps it, since the restored
// iframe still has to connect.
const displayUrl = computed(() => {
  const sanitized = stripRemoteConnectionFromUrl(currentUrl.value)
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

function onWindowMessage(event: MessageEvent) {
  const data = event.data as Partial<RemoteAssetsErrorMessage> | null
  if (typeof data !== 'object' || data === null || data.type !== DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE)
    return
  // Only this view's own frame: a page nested inside it reporting the same
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
  const src = currentUrl.value
  iframe.src = ''
  iframe.src = src
  currentUrl.value = src
  editingUrl.value = src
}

function openExternally() {
  try {
    const url = new URL(stripRemoteConnectionFromUrl(currentUrl.value))
    if (url.protocol === 'http:' || url.protocol === 'https:')
      window.open(url.href, '_blank', 'noopener,noreferrer')
  }
  catch {}
}

let onIframeLoad: (() => void) | undefined
let stopLocationWatch: (() => void) | undefined

onMounted(() => {
  const existed = props.panes.has(paneKey.value)
  // Restore the address-bar route persisted before the last reload: the dock
  // that was selected then boots deep-linked to where the developer left it,
  // instead of the entry's default url. `consumeBootRoute` hands the saved URL
  // back only for that dock, and only once, so a later switch can't reuse it.
  const bootUrl = props.context.panel.consumeBootRoute?.(props.entry.id) ?? props.entry.url
  if (!existed && bootUrl !== currentUrl.value) {
    currentUrl.value = bootUrl
    editingUrl.value = bootUrl
  }
  // `src` is only assigned when the pane is first created, so re-mounting an
  // existing iframe (tab switch) preserves its navigation/scroll/JS state. For
  // a shared frame this is also the boot deep-link: the first member (or the
  // anchor) to become visible seeds the src, and every later switch soft-navs.
  const pane = props.panes.ensure(paneKey.value, {
    src: bootUrl,
    style: { boxShadow: 'none', outline: 'none' },
  })
  const iframe = pane.iframe

  // Follow the frame wherever it goes: a document load, but also an SPA
  // router's `pushState`/`replaceState` and back/forward, none of which fire
  // `load`. `currentUrl` is the single source the address bar renders and the
  // session route persists, so tracking it here keeps both live. Reattaching
  // to an already-live pane reports its current href immediately if it moved
  // on since the last time this view watched it.
  stopLocationWatch = watchFrameLocation({
    iframe,
    initial: currentUrl.value,
    onChange: (href) => {
      currentUrl.value = href
    },
  })

  if (!existed)
    // A freshly created pane is loading its initial content; reflect it so the
    // placeholder covers the first paint, not just later navigations.
    isIframeLoading.value = true

  // Persist this dock's live route while it is the selected one, so the next
  // reload can restore it. Only the selected dock writes, so switching docks
  // never overwrites another's saved route.
  const panelSession = props.context.panel.session
  watchEffect(() => {
    if (props.context.docks.selectedId === props.entry.id)
      panelSession.selectedDockRoute = currentUrl.value
  })

  // Listen for iframe load events
  onIframeLoad = () => {
    isIframeLoading.value = false
  }
  iframe.addEventListener('load', onIframeLoad)

  const entryState = props.context.docks.getStateById(props.entry.id)
  if (entryState)
    entryState.domElements.iframe = iframe

  // iframe-pane positions the iframe exactly over the mount target (the view
  // frame below the address bar), so no manual offset is needed; only the
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
  // A shared frame outlives this view, so its page is left exactly as found;
  // the incoming view starts its own watch.
  stopLocationWatch?.()
  stopLocationWatch = undefined
  const pane = props.panes.get(paneKey.value)
  if (pane && onIframeLoad)
    pane.iframe?.removeEventListener('load', onIframeLoad)
  // Only unmount if this view still owns the pane. When switching between two
  // docks sharing a `frameId`, the incoming view may re-mount the shared pane
  // onto its own container before this outgoing view tears down; unmounting
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
      class="flex-none px-2 w-full flex items-center gap-1 color-base border-base border-b"
      :style="{ height: `${ADDRESS_BAR_HEIGHT}px` }"
    >
      <button
        v-if="showBack"
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray/15 transition-colors shrink-0"
        title="Back"
        @click="goBack"
      >
        <div class="i-ph-caret-left op60 w-4.5 h-4.5" />
      </button>

      <!-- Cross-origin badge -->
      <div
        v-if="isCrossOrigin"
        class="flex items-center gap-1 px2 py1 rounded text-xs bg-amber/10 text-amber border border-amber/20 shrink-0"
        title="Cross-origin iframe"
      >
        <div class="i-ph-globe text-sm" />
        <span>Cross-Origin</span>
      </div>

      <button
        v-if="showReload"
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray/15 transition-colors shrink-0"
        title="Reload"
        @click="refresh"
      >
        <div class="i-ph-arrow-clockwise op60 w-4.5 h-4.5" />
      </button>

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

      <button
        v-if="showOpenExternal"
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray/15 transition-colors shrink-0"
        title="Open externally"
        @click="openExternally"
      >
        <div class="i-ph-arrow-square-out-duotone op60 w-4.5 h-4.5" />
      </button>
    </div>
    <div
      ref="viewFrame"
      class="devframes-view-iframe relative w-full h-full flex-1 items-center justify-center"
    >
      <ViewIframeLoading v-if="showLoadingPlaceholder" />
      <ViewAssetsError
        v-if="assetsError"
        :error="assetsError"
        @retry="refresh"
      />
    </div>
  </div>
</template>
