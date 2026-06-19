<script setup lang="ts">
import type { InvokeResult, RpcFunctionInfo } from '@devframes/plugin-inspect/client'
import type { TreeNode } from './FunctionsTreeNode.vue'
import { computed, reactive, ref } from 'vue'
import FunctionsTreeNode from './FunctionsTreeNode.vue'

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
  if (!q)
    return list
  return list.filter(fn => fn.name.toLowerCase().includes(q))
})

const tree = computed(() => {
  const root: TreeNode = {
    name: 'root',
    fullPath: '',
    isLeaf: false,
    children: {},
  }

  for (const fn of filtered.value) {
    const parts = fn.name.split(':')
    let current = root
    let currentPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}:${part}` : part

      if (!current.children) {
        current.children = {}
      }

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          fullPath: currentPath,
          isLeaf: i === parts.length - 1,
          fn: i === parts.length - 1 ? fn : undefined,
          children: {},
        }
      }
      current = current.children[part]
    }
  }

  return root
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
    // If we want to be fully side-effectless, maybe we should emit an error or just handle parsing here.
    // For now, let's keep the parse error local or emit it.
    // To match original behavior, we mutated `results` directly. Since `results` is a prop, we should probably emit.
    // But Vue props shouldn't be mutated. We will emit 'invoke' and let the parent handle it, or we emit a special error event.
    // Let's just emit the parsed args. If it fails to parse, we can alert or emit an error.
    // To keep it simple, we can emit the parse error to the parent too.
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

    <div v-else class="group">
      <FunctionsTreeNode
        v-for="child in Object.values(tree.children || {}).sort((a, b) => { if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1; return a.name.localeCompare(b.name) })"
        :key="child.name"
        :node="child"
        :depth="0"
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
