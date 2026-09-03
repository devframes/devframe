<script setup lang="ts">
import type { DevframeInspectInstanceInfo } from '../connect'
import { onMounted, shallowRef } from 'vue'
import { useRefreshProvider } from '../composables/refresh'
import { useRpc } from '../composables/rpc'
import InstancesView from './InstancesView.vue'

const rpc = useRpc()
const instances = shallowRef<DevframeInspectInstanceInfo[] | null>(null)

async function fetchData(): Promise<void> {
  if (!rpc.value)
    return
  instances.value = await rpc.value.call('devframes:plugin:inspect:list-instances')
}

useRefreshProvider(fetchData)
onMounted(fetchData)
</script>

<template>
  <InstancesView :instances="instances" />
</template>
