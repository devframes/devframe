<script setup lang="ts">
import { computed } from 'vue'
import { parseNamespacedName } from '../utils/color'

const props = defineProps<{ name: string }>()

const segments = computed(() => parseNamespacedName(props.name))
</script>

<template>
  <span class="fn-name" :title="name"><template v-for="(seg, i) in segments" :key="i"><span
    class="ns-seg"
    :style="seg.color ? { color: seg.color } : undefined"
  >{{ seg.text }}</span><span v-if="seg.separator" class="ns-sep">{{ seg.separator }}</span></template></span>
</template>
