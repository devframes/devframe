<script setup lang="ts">
import type { AssetInfo } from '../../../types'
import type { TreeNode } from '../utils/tree'
import { computed } from 'vue'
import { buildTree } from '../utils/tree'
import AssetListItem from './AssetListItem.vue'

const props = defineProps<{
  assets: AssetInfo[]
  selectedPath?: string
  selectable: boolean
  selectedPaths: Set<string>
}>()

const emit = defineEmits<{
  selectToggle: [path: string]
  select: [asset: AssetInfo]
}>()

const nodes = computed(() => buildTree(props.assets))

function onSelect(node: TreeNode): void {
  if (node.asset)
    emit('select', node.asset)
}
</script>

<template>
  <div>
    <AssetListItem
      v-for="node in nodes"
      :key="node.path"
      :node="node"
      :selected-path="selectedPath"
      :selectable="selectable"
      :selected-paths="selectedPaths"
      @select="onSelect"
      @select-toggle="emit('selectToggle', $event)"
    />
  </div>
</template>
