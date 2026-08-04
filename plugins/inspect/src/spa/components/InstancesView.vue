<script setup lang="ts">
import type { DevframeInspectInstanceInfo } from '@devframes/plugin-inspect/client'
import { computed } from 'vue'

const props = defineProps<{
  instances: DevframeInspectInstanceInfo[] | null
}>()

// Current instance pinned first, then newest (startedAt descending).
const sorted = computed(() => {
  return [...(props.instances ?? [])].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent)
      return a.isCurrent ? -1 : 1
    return b.startedAt - a.startedAt
  })
})

function formatUptime(startedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
  if (seconds < 60)
    return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)
    return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)
    return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}
</script>

<template>
  <div class="pane">
    <div class="toolbar">
      <span class="muted">{{ (instances ?? []).length }} running {{ (instances ?? []).length === 1 ? 'instance' : 'instances' }}</span>
    </div>

    <div v-if="!instances" class="center">
      Discovering instances…
    </div>
    <div v-else-if="instances.length === 0" class="empty">
      No running devframe instances discovered. Each dev server registers itself while it runs — start one to see it here.
    </div>

    <div v-else class="cards">
      <div v-for="inst in sorted" :key="`${inst.pid}-${inst.port}`" class="card">
        <div class="card-head">
          <span class="i-ph-broadcast-duotone cmd-icon" />
          <span class="card-title">{{ inst.name ?? inst.id }}</span>
          <span v-if="inst.isCurrent" class="badge agent">this instance</span>
          <span v-if="inst.hasMcp" class="badge">MCP</span>
        </div>

        <div class="id">
          {{ inst.id }}
        </div>

        <a class="inst-url" :href="inst.url" target="_blank" rel="noopener noreferrer">
          <span class="i-ph-arrow-square-out-duotone" />
          <span class="inst-url-text">{{ inst.url }}</span>
        </a>

        <dl class="inst-meta">
          <div>
            <dt>Port</dt>
            <dd>{{ inst.port }}</dd>
          </div>
          <div>
            <dt>PID</dt>
            <dd>{{ inst.pid }}</dd>
          </div>
          <div>
            <dt>Uptime</dt>
            <dd>{{ formatUptime(inst.startedAt) }}</dd>
          </div>
          <div class="inst-meta-wide">
            <dt>Root</dt>
            <dd :title="inst.rootDir">
              {{ inst.rootDir }}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>
