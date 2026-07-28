<script setup lang="ts">
import type { AssetInfo, AssetType } from '../../types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import OverlayModal from '@antfu/design/components/Overlay/OverlayModal.vue'
import { computed, onMounted, ref } from 'vue'
import AssetDetails from './components/AssetDetails.vue'
import AssetGrid from './components/AssetGrid.vue'
import AssetTree from './components/AssetTree.vue'
import Toolbar from './components/Toolbar.vue'
import TypeFilter from './components/TypeFilter.vue'
import { useAssets } from './composables/useAssets'
import { useFileDrop } from './composables/useFileDrop'
import { useLocalStorage } from './composables/useLocalStorage'
import { useUpload } from './composables/useUpload'
import { connectionBody, connectionGlyph, connectionPanel, connectionState, connectionTitle } from './design'
import { ASSET_TYPES } from './utils/assetType'

type ViewMode = 'grid' | 'list'

const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 900
const DEFAULT_PANEL_WIDTH = 480

const { assets, capabilities, loading, error, isStatic, status, rpc, connect, refresh } = useAssets()
onMounted(connect)

const view = useLocalStorage<ViewMode>('devframes:plugin:assets:view', 'grid')
const panelWidth = useLocalStorage<number>('devframes:plugin:assets:panelWidth', DEFAULT_PANEL_WIDTH)
const search = ref('')
const typeState = ref<Partial<Record<AssetType, boolean>>>({})
const selected = ref<AssetInfo | undefined>()
const selectedPaths = ref<Set<string>>(new Set())
const mkdirOpen = ref(false)
const newFolderName = ref('')
const bulkDeleteOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const { uploading, errors: uploadErrors, uploadFiles } = useUpload(rpc, () => void refresh())

const canWrite = computed(() => capabilities.value?.write ?? false)
const readOnly = computed(() => !canWrite.value && !loading.value)

const connState = computed(() => connectionState(status.value))
const banner = computed(() => error.value ?? (uploadErrors.value.length ? uploadErrors.value.join(' · ') : null))

// Types present in the listing, with counts, in canonical display order.
const typeItems = computed(() => {
  const counts = new Map<AssetType, number>()
  for (const asset of assets.value ?? [])
    counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1)
  return ASSET_TYPES
    .filter(type => counts.has(type))
    .map(type => ({ type, count: counts.get(type)!, checked: typeState.value[type] !== false }))
})

const filtered = computed(() => {
  const list = assets.value ?? []
  const query = search.value.trim().toLowerCase()
  return list.filter((asset) => {
    if (typeState.value[asset.type] === false)
      return false
    if (query && !asset.path.toLowerCase().includes(query))
      return false
    return true
  })
})

function toggleType(type: AssetType): void {
  typeState.value = { ...typeState.value, [type]: typeState.value[type] === false }
}

function toggleSelect(path: string): void {
  const next = new Set(selectedPaths.value)
  if (next.has(path))
    next.delete(path)
  else
    next.add(path)
  selectedPaths.value = next
}

function uploadSelected(files: FileList): void {
  void uploadFiles(Array.from(files).map(file => ({ file, targetPath: file.name })))
}

const { dragging } = useFileDrop(() => canWrite.value, uploadSelected)

function onFilePick(e: Event): void {
  const input = e.target as HTMLInputElement
  if (input.files?.length)
    uploadSelected(input.files)
  input.value = '' // reset so picking the same file again still fires `change`
}

async function handleBulkDelete(): Promise<void> {
  if (!rpc.value)
    return
  await rpc.value.call('devframes:plugin:assets:delete', { paths: Array.from(selectedPaths.value) })
  selectedPaths.value = new Set()
  bulkDeleteOpen.value = false
  await refresh()
}

async function handleMkdir(): Promise<void> {
  if (!rpc.value || !newFolderName.value.trim())
    return
  await rpc.value.call('devframes:plugin:assets:mkdir', { path: newFolderName.value.trim() })
  newFolderName.value = ''
  mkdirOpen.value = false
  await refresh()
}

function startResize(e: PointerEvent): void {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = panelWidth.value
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  function onMove(ev: PointerEvent): void {
    // Panel is on the right, so dragging its left edge leftwards widens it.
    panelWidth.value = Math.min(Math.max(startWidth + (startX - ev.clientX), MIN_PANEL_WIDTH), MAX_PANEL_WIDTH)
  }
  function onUp(): void {
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
</script>

<template>
  <div v-if="connState" :class="connectionPanel('h-screen')">
    <span :class="[connectionGlyph(connState.spin), connState.icon]" />
    <div :class="connectionTitle()">
      {{ connState.title }}
    </div>
    <div :class="connectionBody()">
      {{ connState.body }}
    </div>
    <ActionButton v-if="connState.reloadable" @click="() => location.reload()">
      Reload
    </ActionButton>
  </div>

  <div v-else class="flex h-screen flex-col bg-base color-base">
    <Toolbar
      v-model:search="search"
      v-model:view="view"
      :total="assets?.length ?? 0"
      :filtered="filtered.length"
      :can-write="canWrite"
      :is-static="isStatic"
      :read-only="readOnly"
      :uploading="uploading"
      :selected-count="selectedPaths.size"
      @upload="fileInput?.click()"
      @new-folder="mkdirOpen = true"
      @bulk-delete="bulkDeleteOpen = true"
      @clear-selection="selectedPaths = new Set()"
    />

    <TypeFilter :items="typeItems" @toggle="toggleType" />

    <div v-if="banner" class="shrink-0 border-b border-base bg-error/10 px-3 py-1 text-xs text-error">
      {{ banner }}
    </div>

    <div class="flex min-h-0 flex-1">
      <main class="min-h-0 flex-1 overflow-auto">
        <div v-if="loading" class="flex h-full items-center justify-center op-fade text-sm">
          Loading assets…
        </div>
        <div v-else-if="filtered.length === 0" class="flex h-full items-center justify-center op-fade text-sm">
          No assets found.
        </div>
        <AssetGrid
          v-else-if="view === 'grid'"
          :assets="filtered"
          :selectable="canWrite"
          :selected-paths="selectedPaths"
          @select-toggle="toggleSelect"
          @select="selected = $event"
        />
        <AssetTree
          v-else
          :assets="filtered"
          :selected-path="selected?.path"
          :selectable="canWrite"
          :selected-paths="selectedPaths"
          @select-toggle="toggleSelect"
          @select="selected = $event"
        />
      </main>

      <aside
        v-if="selected"
        class="relative min-h-0 shrink-0 border-l border-base bg-base"
        :style="{ width: `${panelWidth}px` }"
      >
        <div
          class="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-active"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize details panel"
          @pointerdown="startResize"
        />
        <div class="h-full min-h-0 overflow-y-auto">
          <AssetDetails
            :asset="selected"
            :rpc="rpc"
            :can-write="canWrite"
            @close="selected = undefined"
            @changed="() => void refresh()"
          />
        </div>
      </aside>
    </div>

    <!-- Direct file picker for the Upload button — no modal. -->
    <input ref="fileInput" type="file" multiple class="hidden" @change="onFilePick">

    <!-- Non-blocking hint while files are dragged over the frame. -->
    <div v-if="dragging" class="pointer-events-none fixed inset-0 z-drawer-content flex items-center justify-center bg-base/80 backdrop-blur-sm">
      <div class="flex flex-col items-center gap-2 rounded-xl border-2 border-active border-dashed px-10 py-8 text-lg color-active">
        <span class="i-ph-cloud-arrow-up-duotone text-3xl" />
        <span>Drop files to upload</span>
      </div>
    </div>

    <OverlayModal v-model:open="mkdirOpen" title="New folder">
      <FormTextInput v-model="newFolderName" placeholder="Folder name" @keydown.enter="handleMkdir" />
      <template #footer>
        <ActionButton @click="mkdirOpen = false">
          Cancel
        </ActionButton>
        <ActionButton variant="primary" :disabled="!newFolderName.trim()" @click="handleMkdir">
          Create
        </ActionButton>
      </template>
    </OverlayModal>

    <OverlayModal v-model:open="bulkDeleteOpen" title="Delete assets">
      <p>Are you sure you want to delete {{ selectedPaths.size }} asset(s)?</p>
      <template #footer>
        <ActionButton @click="bulkDeleteOpen = false">
          Cancel
        </ActionButton>
        <ActionButton class="text-error border-error/30!" @click="handleBulkDelete">
          Delete
        </ActionButton>
      </template>
    </OverlayModal>
  </div>
</template>
