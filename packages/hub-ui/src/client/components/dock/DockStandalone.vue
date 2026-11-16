<script setup lang="ts">
import type { DocksContext } from '@devframes/hub/client'
import { ref, watch } from 'vue'
import DockStandaloneShell from './DockStandaloneShell.vue'

const props = defineProps<{ context: DocksContext }>()

// Panes and trust subscriptions belong to the context that created them.
const shellKey = ref(0)
watch(() => props.context, () => shellKey.value++)
</script>

<template>
  <DockStandaloneShell :key="shellKey" :context />
</template>
