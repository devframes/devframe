<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import LayoutTabs from '@antfu/design/components/Layout/LayoutTabs.vue'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'

defineProps<{
  total: number
  filtered: number
  canWrite: boolean
  isStatic: boolean
  readOnly: boolean
  uploading: boolean
  selectedCount: number
}>()

const emit = defineEmits<{
  upload: []
  newFolder: []
  bulkDelete: []
  clearSelection: []
}>()

const search = defineModel<string>('search', { default: '' })
const view = defineModel<'grid' | 'list'>('view', { default: 'grid' })

const viewTabs = [
  { value: 'grid', icon: 'i-ph-grid-four-duotone', label: 'Grid' },
  { value: 'list', icon: 'i-ph-list-duotone', label: 'List' },
]
</script>

<template>
  <LayoutToolbar :glass="false" class="h-nav">
    <span class="flex shrink-0 select-none items-center gap-1.5 text-sm font-semibold">
      <span class="i-ph-image-square-duotone text-base color-active" />
      <span>Assets</span>
    </span>
    <DisplayBadge v-if="isStatic" text="static" class="text-xs" />
    <DisplayBadge v-if="readOnly" text="read-only" class="text-xs" />
    <DisplayBadge v-if="uploading" text="uploading…" class="text-xs" />

    <template #search>
      <FormTextInput
        v-model="search"
        icon="i-ph-magnifying-glass"
        placeholder="Search assets…"
        clearable
        class="max-w-80 w-full"
      />
    </template>

    <template #end>
      <template v-if="selectedCount > 0">
        <span class="whitespace-nowrap text-sm font-medium">{{ selectedCount }} selected</span>
        <ActionButton class="text-error border-error/30!" icon="i-ph-trash-duotone" @click="emit('bulkDelete')">
          Delete
        </ActionButton>
        <ActionButton variant="text" @click="emit('clearSelection')">
          Cancel
        </ActionButton>
      </template>
      <template v-else>
        <span class="whitespace-nowrap op-fade text-xs">
          <template v-if="search">{{ filtered }} matched · </template>{{ total }} assets
        </span>
        <ActionIconButton
          v-if="canWrite"
          icon="i-ph-folder-plus-duotone"
          label="New folder"
          tooltip="New folder"
          @click="emit('newFolder')"
        />
        <ActionIconButton
          v-if="canWrite"
          icon="i-ph-cloud-arrow-up-duotone"
          label="Upload"
          tooltip="Upload"
          @click="emit('upload')"
        />
        <LayoutTabs v-model="view" :tabs="viewTabs" variant="segment" />
      </template>
    </template>
  </LayoutToolbar>
</template>
