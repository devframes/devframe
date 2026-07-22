<script setup lang="ts">
import type { DevframeInspectCommandInfo, InvokeResult } from '@devframes/plugin-inspect/client'
import { computed, reactive, ref } from 'vue'
import CommandRow from './CommandRow.vue'

const props = defineProps<{
  commands: DevframeInspectCommandInfo[] | null
  isStatic: boolean
  results: Record<string, InvokeResult | { ok: false, error: { name: string, message: string } }>
  pending: Record<string, boolean>
}>()

const emit = defineEmits<{
  (e: 'execute', cmd: DevframeInspectCommandInfo, parsedArgs: unknown[]): void
}>()

const search = ref('')
const argsInput = reactive<Record<string, string>>({})

function matches(cmd: DevframeInspectCommandInfo, q: string): boolean {
  if (cmd.id.toLowerCase().includes(q) || cmd.title.toLowerCase().includes(q) || cmd.category?.toLowerCase().includes(q))
    return true
  return cmd.children?.some(child => matches(child, q)) ?? false
}

const filtered = computed(() => {
  const list = props.commands ?? []
  const q = search.value.trim().toLowerCase()
  const matched = q ? list.filter(cmd => matches(cmd, q)) : list
  return [...matched].sort((a, b) => a.title.localeCompare(b.title))
})

const categoryStats = computed(() => {
  const stats: Record<string, number> = {}
  for (const cmd of props.commands ?? []) {
    const category = cmd.category ?? 'uncategorized'
    stats[category] = (stats[category] || 0) + 1
  }
  return stats
})

function execute(cmd: DevframeInspectCommandInfo): void {
  let parsed: unknown[]
  try {
    const raw = JSON.parse(argsInput[cmd.id] || '[]')
    parsed = Array.isArray(raw) ? raw : [raw]
  }
  catch (e) {
    throw new Error(`Invalid JSON args: ${(e as Error).message}`)
  }
  emit('execute', cmd, parsed)
}
</script>

<template>
  <div class="pane">
    <div class="toolbar">
      <label class="search">
        <div class="i-ph-magnifying-glass-duotone" />
        <input v-model="search" placeholder="Filter commands by id, title, category…" spellcheck="false">
      </label>
      <span class="muted">{{ (commands ?? []).length }} commands</span>
      <span v-for="(count, category) in categoryStats" :key="category" class="muted">
        <span class="badge flag">{{ category }}</span> {{ count }}
      </span>
    </div>

    <div v-if="!commands" class="center">
      Loading commands…
    </div>
    <div v-else-if="commands.length === 0" class="empty">
      No commands registered — commands are a `@devframes/hub` feature; this connection isn't mounted inside a hub.
    </div>
    <div v-else-if="filtered.length === 0" class="empty">
      No commands match "{{ search }}".
    </div>

    <div v-else class="fn-list">
      <CommandRow
        v-for="cmd in filtered"
        :key="cmd.id"
        :cmd="cmd"
        :args-input="argsInput"
        :results="results"
        :pending="pending"
        :is-static="isStatic"
        @execute="execute"
        @update-args="(n, v) => argsInput[n] = v"
      />
    </div>
  </div>
</template>
