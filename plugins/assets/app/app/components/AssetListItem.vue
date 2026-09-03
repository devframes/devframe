<script setup lang="ts">
import type { TreeNode } from '../utils/tree'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import { computed, ref } from 'vue'
import { TYPE_META } from '../utils/assetType'

defineOptions({ name: 'AssetListItem' })

const props = withDefaults(defineProps<{
  node: TreeNode
  depth?: number
  selectedPath?: string
  selectable?: boolean
  selectedPaths?: Set<string>
}>(), { depth: 0 })

const emit = defineEmits<{
  select: [node: TreeNode]
  selectToggle: [path: string]
}>()

const open = ref(true)
const icon = computed(() => (props.node.isFolder ? 'i-ph-folder-duotone' : TYPE_META[props.node.asset?.type ?? 'other'].icon))
const isActive = computed(() => !props.node.isFolder && props.node.asset?.path === props.selectedPath)

function onActivate(): void {
  if (props.node.isFolder)
    open.value = !open.value
  else
    emit('select', props.node)
}
</script>

<template>
  <div>
    <div
      class="flex w-full items-center gap-2 border-b border-base px-4 py-1 text-sm hover:bg-active"
      :class="isActive ? 'bg-active' : 'cursor-pointer'"
      :style="{ paddingLeft: `${1 + depth * 1.25}rem` }"
      role="button"
      tabindex="0"
      @click="onActivate"
      @keydown.enter="onActivate"
    >
      <span v-if="selectable && !node.isFolder" @click.stop>
        <FormCheckbox :model-value="selectedPaths?.has(node.path)" @update:model-value="emit('selectToggle', node.path)" />
      </span>
      <span :class="icon" />
      <span class="flex-1 truncate text-left font-mono">{{ node.name }}</span>
      <span v-if="node.isFolder" class="i-ph-caret-right transition" :class="open ? 'rotate-90' : ''" />
    </div>
    <template v-if="node.isFolder && open">
      <AssetListItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :selected-path="selectedPath"
        :selectable="selectable"
        :selected-paths="selectedPaths"
        @select="emit('select', $event)"
        @select-toggle="emit('selectToggle', $event)"
      />
    </template>
  </div>
</template>
