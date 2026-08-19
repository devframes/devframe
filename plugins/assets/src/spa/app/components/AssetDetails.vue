<script setup lang="ts">
// Types-only: loads service-open's RPC/scope augmentations so the scoped
// `open.rpc.call('open-in-editor', …)` below is fully typed.
import type {} from '@devframes/service-open'
import type { DevframeRpcClient } from 'devframe/client'
import type { AssetImageMeta, AssetInfo } from '../../../types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import OverlayModal from '@antfu/design/components/Overlay/OverlayModal.vue'
import { computed, ref, watch } from 'vue'
import { fileNameOf, formatFileSize, formatTimeAgo } from '../utils/format'
import { highlightAsset } from '../utils/highlight'
import { buildSnippets } from '../utils/snippets'
import AssetPreview from './AssetPreview.vue'
import CodeSnippets from './CodeSnippets.vue'

const props = defineProps<{
  asset: AssetInfo
  rpc: DevframeRpcClient | null
  canWrite: boolean
}>()

const emit = defineEmits<{ close: [], changed: [] }>()

const SUPPORTS_PREVIEW = new Set(['image', 'text', 'video', 'audio', 'font'])

const imageMeta = ref<AssetImageMeta | null>(null)
const textContent = ref<string | null>(null)
const highlightedHtml = ref<string | null>(null)
const deleteOpen = ref(false)
const renameOpen = ref(false)
const newName = ref('')
const busy = ref(false)
const errorNotice = ref<string | null>(null)

watch(() => props.asset.path, (path) => {
  imageMeta.value = null
  textContent.value = null
  highlightedHtml.value = null
  errorNotice.value = null
  const rpc = props.rpc
  if (!rpc)
    return
  if (props.asset.type === 'image')
    void rpc.call('devframes:plugin:assets:read-image-meta', path).then((m) => { imageMeta.value = m })
  if (props.asset.type === 'text') {
    void rpc.call('devframes:plugin:assets:read-text', path, 5000).then(async (c) => {
      textContent.value = c
      // Server-highlighted preview via the shiki wire service; `null` when
      // it isn't advertised — the preview keeps its plain `<pre>`.
      const html = c == null ? null : await highlightAsset(rpc, path, c)
      if (props.asset.path === path)
        highlightedHtml.value = html
    })
  }
}, { immediate: true })

// The open/reveal affordances delegate to the `@devframes/service-open`
// wire service; hide them until the host advertises it.
const openServiceAvailable = ref(false)
watch(() => props.rpc, (rpc) => {
  if (!rpc)
    return
  openServiceAvailable.value = rpc.services.has('@devframes/service-open')
  rpc.services.state()
    .then((state) => {
      openServiceAvailable.value = rpc.services.has('@devframes/service-open')
      state.on('updated', () => (openServiceAvailable.value = rpc.services.has('@devframes/service-open')))
    })
    .catch(() => {})
}, { immediate: true })

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

const aspectRatio = computed(() => {
  const m = imageMeta.value
  if (!m?.width || !m?.height)
    return ''
  const ratio = gcd(m.width, m.height)
  return ratio > 3 ? `${m.width / ratio}:${m.height / ratio}` : ''
})

const snippets = computed(() => buildSnippets(props.asset, imageMeta.value))
const supportsPreview = computed(() => SUPPORTS_PREVIEW.has(props.asset.type))

async function runAction(fn: () => Promise<void>): Promise<void> {
  if (!props.rpc)
    return
  errorNotice.value = null
  busy.value = true
  try {
    await fn()
  }
  catch (cause) {
    errorNotice.value = cause instanceof Error ? cause.message : String(cause)
  }
  finally {
    busy.value = false
  }
}

async function handleDelete(): Promise<void> {
  await runAction(async () => {
    await props.rpc!.call('devframes:plugin:assets:delete', { paths: [props.asset.path] })
    deleteOpen.value = false
    emit('changed')
    emit('close')
  })
}

async function handleRename(): Promise<void> {
  await runAction(async () => {
    await props.rpc!.call('devframes:plugin:assets:rename', { path: props.asset.path, newName: newName.value })
    renameOpen.value = false
    emit('changed')
    emit('close')
  })
}

async function handleOpenInEditor(): Promise<void> {
  await runAction(async () => {
    const open = props.rpc!.services.get('@devframes/service-open')
    if (open && props.asset.fsPath)
      await open.rpc.call('open-in-editor', { path: props.asset.fsPath })
  })
}

async function handleRevealInFolder(): Promise<void> {
  await runAction(async () => {
    const open = props.rpc!.services.get('@devframes/service-open')
    if (open && props.asset.fsPath) {
      // Reveal the containing folder: pass the parent dir to open-in-finder.
      const parent = props.asset.fsPath.replace(/[/\\][^/\\]*$/, '')
      await open.rpc.call('open-in-finder', { path: parent })
    }
  })
}

function openRenameDialog(): void {
  newName.value = fileNameOf(props.asset.path).replace(/\.[^./]+$/, '')
  renameOpen.value = true
}

function openInBrowser(): void {
  window.open(props.asset.publicPath, '_blank')
}
</script>

<template>
  <div class="flex min-h-full w-full flex-col gap-4 p-4">
    <div class="flex items-center justify-between gap-2">
      <h2 class="truncate text-sm font-medium font-mono">
        {{ asset.path }}
      </h2>
      <ActionIconButton icon="i-ph-x" label="Close" tooltip="Close" @click="emit('close')" />
    </div>

    <div v-if="supportsPreview" class="flex items-center justify-center">
      <AssetPreview
        :asset="asset"
        detail
        :text-content="textContent"
        :highlighted-html="highlightedHtml"
        class="max-h-80 min-h-20 w-auto min-w-20 rounded border border-base"
      />
    </div>

    <table class="w-full table-fixed">
      <tbody>
        <tr>
          <td class="w-28 whitespace-nowrap pr-4 text-right text-xs op-fade">
            Public Path
          </td>
          <td class="text-sm">
            <div class="flex items-center gap-1 overflow-hidden">
              <a :href="asset.publicPath" target="_blank" rel="noreferrer" class="flex-1 truncate text-xs color-active font-mono">{{ asset.publicPath }}</a>
              <ActionIconButton icon="i-ph-arrow-square-out" label="Open in browser" tooltip="Open in browser" class="text-sm" @click="openInBrowser" />
            </div>
          </td>
        </tr>
        <tr>
          <td class="w-28 whitespace-nowrap pr-4 text-right text-xs op-fade">
            Type
          </td>
          <td class="text-sm capitalize">
            {{ asset.type }}
          </td>
        </tr>
        <tr v-if="imageMeta?.width">
          <td class="w-28 whitespace-nowrap pr-4 text-right text-xs op-fade">
            Image Size
          </td>
          <td class="text-sm">
            {{ imageMeta.width }} x {{ imageMeta.height }}
          </td>
        </tr>
        <tr v-if="aspectRatio">
          <td class="w-28 whitespace-nowrap pr-4 text-right text-xs op-fade">
            Aspect Ratio
          </td>
          <td class="text-sm">
            {{ aspectRatio }}
          </td>
        </tr>
        <tr>
          <td class="w-28 whitespace-nowrap pr-4 text-right text-xs op-fade">
            File Size
          </td>
          <td class="text-sm">
            {{ formatFileSize(asset.size) }}
          </td>
        </tr>
        <tr>
          <td class="w-28 whitespace-nowrap pr-4 text-right text-xs op-fade">
            Last Modified
          </td>
          <td class="text-sm">
            {{ new Date(asset.mtime).toLocaleString() }}
            <span class="op-fade">({{ formatTimeAgo(asset.mtime) }})</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="flex flex-wrap gap-2">
      <ActionButton variant="primary" icon="i-ph-download-simple-duotone" @click="openInBrowser">
        Download
      </ActionButton>
      <ActionButton v-if="openServiceAvailable && asset.fsPath" icon="i-ph-code-duotone" :disabled="busy" @click="handleOpenInEditor">
        Open in Editor
      </ActionButton>
      <ActionButton v-if="openServiceAvailable && asset.fsPath" icon="i-ph-folder-open-duotone" :disabled="busy" @click="handleRevealInFolder">
        Reveal in Folder
      </ActionButton>
      <ActionButton v-if="canWrite" icon="i-ph-text-aa-duotone" @click="openRenameDialog">
        Rename
      </ActionButton>
      <ActionButton v-if="canWrite" class="text-error border-error/30!" icon="i-ph-trash-duotone" @click="deleteOpen = true">
        Delete
      </ActionButton>
    </div>

    <div v-if="errorNotice" class="text-xs text-error">
      {{ errorNotice }}
    </div>

    <div class="flex-1" />

    <CodeSnippets v-if="snippets.length" :snippets="snippets" />
  </div>

  <OverlayModal v-model:open="deleteOpen" title="Delete asset">
    <p>
      Are you sure you want to delete <strong class="font-mono">{{ fileNameOf(asset.path) }}</strong>?
    </p>
    <template #footer>
      <ActionButton @click="deleteOpen = false">
        Cancel
      </ActionButton>
      <ActionButton class="text-error border-error/30!" :disabled="busy" @click="handleDelete">
        Delete
      </ActionButton>
    </template>
  </OverlayModal>

  <OverlayModal v-model:open="renameOpen" title="Rename asset">
    <FormTextInput v-model="newName" placeholder="New name" @keydown.enter="handleRename" />
    <template #footer>
      <ActionButton @click="renameOpen = false">
        Cancel
      </ActionButton>
      <ActionButton variant="primary" :disabled="busy || !newName.trim()" @click="handleRename">
        Rename
      </ActionButton>
    </template>
  </OverlayModal>
</template>
