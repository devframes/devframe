<script setup lang="ts">
import type { AssetInfo } from '../../../types'
import { computed } from 'vue'
import { groupByFolder } from '../utils/tree'
import AssetGridItem from './AssetGridItem.vue'
import SectionBlock from './SectionBlock.vue'

const props = defineProps<{
  assets: AssetInfo[]
  selectable: boolean
  selectedPaths: Set<string>
}>()

const emit = defineEmits<{
  selectToggle: [path: string]
  select: [asset: AssetInfo]
}>()

const groups = computed(() => groupByFolder(props.assets))

const GRID_STYLE = { gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))' }

function labelOf(asset: AssetInfo, folder: string): string {
  return folder && asset.path.startsWith(folder) ? asset.path.slice(folder.length) : asset.path
}
</script>

<template>
  <!-- Flat grid when everything lives in one folder. -->
  <div v-if="groups.length <= 1" class="grid gap-2 p-2" :style="GRID_STYLE">
    <AssetGridItem
      v-for="asset in assets"
      :key="asset.path"
      :asset="asset"
      :label="asset.path"
      :selectable="selectable"
      :is-selected="selectedPaths.has(asset.path)"
      @select="emit('select', asset)"
      @select-toggle="emit('selectToggle', $event)"
    />
  </div>

  <!-- Otherwise a collapsible section per folder. -->
  <div v-else>
    <SectionBlock
      v-for="{ folder, items } in groups"
      :key="folder || '/'"
      :title="folder || '/'"
      :description="`${items.length} items`"
      :default-open="items.length <= 200"
    >
      <div class="grid gap-2 p-2" :style="GRID_STYLE">
        <AssetGridItem
          v-for="asset in items"
          :key="asset.path"
          :asset="asset"
          :label="labelOf(asset, folder)"
          :selectable="selectable"
          :is-selected="selectedPaths.has(asset.path)"
          @select="emit('select', asset)"
          @select-toggle="emit('selectToggle', $event)"
        />
      </div>
    </SectionBlock>
  </div>
</template>
