<script setup lang="ts">
import type { DevframeConnectionStatus } from '@devframes/plugin-code-server/client'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed } from 'vue'

const props = defineProps<{
  status: DevframeConnectionStatus
  error?: string | null
}>()

interface Copy { icon: string, title: string, body: string }

const COPY: Record<Exclude<DevframeConnectionStatus, 'connected'>, Copy> = {
  connecting: {
    icon: 'i-ph-plugs-connected-duotone',
    title: 'Connecting…',
    body: 'Establishing a connection to the devframe server.',
  },
  disconnected: {
    icon: 'i-ph-plugs-duotone',
    title: 'Disconnected',
    body: 'Lost the connection to the devframe server. Reload once it is back up.',
  },
  unauthorized: {
    icon: 'i-ph-lock-key-duotone',
    title: 'Not authorized',
    body: 'Reopen the link printed by your dev server, then reload.',
  },
  error: {
    icon: 'i-ph-warning-octagon-duotone',
    title: 'Connection failed',
    body: 'Could not reach the devframe server.',
  },
}

const copy = computed(() => COPY[props.status as Exclude<DevframeConnectionStatus, 'connected'>])
</script>

<template>
  <div
    v-if="status !== 'connected' && copy"
    class="absolute inset-0 z-nav flex flex-col items-center justify-center gap-4 p-8 text-center bg-base color-base font-sans"
  >
    <div :class="copy.icon" class="text-4xl color-active" />
    <div class="flex flex-col gap-1">
      <p class="text-lg font-medium">
        {{ copy.title }}
      </p>
      <p class="text-sm color-muted max-w-sm">
        {{ copy.body }}
      </p>
      <code v-if="error && status === 'error'" class="mt-1 max-w-sm break-words font-mono text-xs color-faint">
        {{ error }}
      </code>
    </div>
    <ActionButton v-if="status !== 'connecting'" variant="primary" size="sm" @click="() => location.reload()">
      Reload
    </ActionButton>
  </div>
</template>
