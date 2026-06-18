<script setup lang="ts">
import type { InvokeResult, RpcFunctionInfo } from '@devframes/plugin-inspect/client'
import { computed, onMounted, reactive, ref, shallowRef } from 'vue'
import { isStatic, useRpc } from '../composables/rpc'
import { useRefreshProvider } from '../composables/refresh'
import FunctionsTreeNode, { type TreeNode } from './FunctionsTreeNode.vue'

const rpc = useRpc()
const functions = shallowRef<RpcFunctionInfo[] | null>(null)
const search = ref('')
const argsInput = reactive<Record<string, string>>({})
const results = reactive<Record<string, InvokeResult | { ok: false, error: { name: string, message: string } }>>({})
const pending = reactive<Record<string, boolean>>({})

async function fetchData(): Promise<void> {
  if (!rpc.value)
    return
  functions.value = await rpc.value.call('devframes-plugin-inspect:list-functions')
}

useRefreshProvider(fetchData)
onMounted(fetchData)

const filtered = computed(() => {
  const list = functions.value ?? []
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
    children: {}
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
          children: {}
        }
      }
      current = current.children[part]
    }
  }
  
  return root
})

const typeStats = computed(() => {
  const stats: Record<string, number> = {}
  for (const fn of functions.value ?? [])
    stats[fn.type] = (stats[fn.type] || 0) + 1
  return stats
})

async function invoke(fn: RpcFunctionInfo): Promise<void> {
  if (!rpc.value)
    return
  let parsed: unknown[]
  try {
    const raw = JSON.parse(argsInput[fn.name] || '[]')
    parsed = Array.isArray(raw) ? raw : [raw]
  }
  catch (e) {
    results[fn.name] = { ok: false, error: { name: 'SyntaxError', message: `Invalid JSON args: ${(e as Error).message}` } }
    return
  }
  pending[fn.name] = true
  try {
    results[fn.name] = await rpc.value.call('devframes-plugin-inspect:invoke', fn.name, parsed)
  }
  catch (e) {
    const err = e as Error
    results[fn.name] = { ok: false, error: { name: err?.name ?? 'Error', message: err?.message ?? String(e) } }
  }
  finally {
    pending[fn.name] = false
  }
}
</script>

<template>
  <div class="pane">
    <div class="toolbar">
      <label class="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input v-model="search" placeholder="Filter functions by name…" spellcheck="false">
      </label>
      <span class="muted">{{ (functions ?? []).length }} functions</span>
      <span v-for="(count, type) in typeStats" :key="type" class="muted">
        <span class="badge" :class="type">{{ type }}</span> {{ count }}
      </span>
    </div>

    <div v-if="!functions" class="center">Loading functions…</div>
    <div v-else-if="filtered.length === 0" class="empty">No functions match “{{ search }}”.</div>

    <div v-else class="group">
      <FunctionsTreeNode
        v-for="child in Object.values(tree.children || {}).sort((a,b) => { if(a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1; return a.name.localeCompare(b.name) })"
        :key="child.name"
        :node="child"
        :depth="0"
        :args-input="argsInput"
        :results="results"
        :pending="pending"
        @invoke="invoke"
      />
    </div>
  </div>
</template>
