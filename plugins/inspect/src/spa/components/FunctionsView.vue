<script setup lang="ts">
import type { InvokeResult, RpcFunctionInfo } from '@devframes/plugin-inspect/client'
import { computed, reactive, ref } from 'vue'
import FunctionRow from './FunctionRow.vue'

const props = defineProps<{
  functions: RpcFunctionInfo[] | null
  isStatic: boolean
  results: Record<string, InvokeResult | { ok: false, error: { name: string, message: string } }>
  pending: Record<string, boolean>
}>()

const emit = defineEmits<{
  (e: 'invoke', fn: RpcFunctionInfo, parsedArgs: unknown[]): void
}>()

const search = ref('')
const argsInput = reactive<Record<string, string>>({})

const filtered = computed(() => {
  const list = props.functions ?? []
  const q = search.value.trim().toLowerCase()
  const matched = q ? list.filter(fn => fn.name.toLowerCase().includes(q)) : list
  return [...matched].sort((a, b) => a.name.localeCompare(b.name))
})

const typeStats = computed(() => {
  const stats: Record<string, number> = {}
  for (const fn of props.functions ?? [])
    stats[fn.type] = (stats[fn.type] || 0) + 1
  return stats
})

function invoke(fn: RpcFunctionInfo): void {
  let parsed: unknown[]
  try {
    const raw = JSON.parse(argsInput[fn.name] || '[]')
    parsed = Array.isArray(raw) ? raw : [raw]
  }
  catch (e) {
    throw new Error(`Invalid JSON args: ${(e as Error).message}`)
  }
  emit('invoke', fn, parsed)
}
</script>

<template>
  <div class="pane">
    <div class="toolbar">
      <label class="search">
        <div class="i-ph-magnifying-glass-duotone" />
        <input v-model="search" placeholder="Filter functions by name…" spellcheck="false">
      </label>
      <span class="muted">{{ (functions ?? []).length }} functions</span>
      <span v-for="(count, type) in typeStats" :key="type" class="muted">
        <span class="badge" :class="type">{{ type }}</span> {{ count }}
      </span>
    </div>

    <div v-if="!functions" class="center">
      Loading functions…
    </div>
    <div v-else-if="filtered.length === 0" class="empty">
      No functions match “{{ search }}”.
    </div>

    <div v-else class="fn-list">
      <FunctionRow
        v-for="fn in filtered"
        :key="fn.name"
        :fn="fn"
        :args-input="argsInput"
        :results="results"
        :pending="pending"
        :is-static="isStatic"
        @invoke="invoke"
        @update-args="(n, v) => argsInput[n] = v"
      />
    </div>
  </div>
</template>
