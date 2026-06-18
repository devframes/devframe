<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRefreshProvider } from '../composables/refresh'
import { isStatic, useRpc } from '../composables/rpc'
import JsonView from './JsonView.vue'

const rpc = useRpc()
const keys = shallowRef<string[] | null>(null)
const showInternal = ref(false)
const selectedKey = ref<string | null>(null)
const value = shallowRef<unknown>(undefined)
const loading = ref(false)
const highlightPaths = shallowRef<Set<string>>(new Set())
const updates = ref(0)

let off: (() => void) | null = null
let flashTimer: ReturnType<typeof setTimeout> | null = null

async function fetchData(): Promise<void> {
  if (!rpc.value)
    return
  keys.value = await rpc.value.call('devframes-plugin-inspect:list-state-keys')
}

useRefreshProvider(fetchData)
onMounted(fetchData)

const filteredKeys = computed(() => {
  const list = keys.value ?? []
  if (showInternal.value)
    return list
  return list.filter(k => !k.startsWith('devframe:') && !k.startsWith('__'))
})

function diffPaths(a: unknown, b: unknown, base = '', acc = new Set<string>()): Set<string> {
  if (a === b)
    return acc
  const aObj = a !== null && typeof a === 'object'
  const bObj = b !== null && typeof b === 'object'
  if (!aObj || !bObj) {
    acc.add(base)
    return acc
  }
  const all = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
  for (const k of all) {
    const childBase = base ? `${base}.${k}` : k
    const inA = k in (a as object)
    const inB = k in (b as object)
    if (!inA || !inB)
      acc.add(childBase)
    else
      diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], childBase, acc)
  }
  return acc
}

function flash(paths: Set<string>): void {
  highlightPaths.value = paths
  if (flashTimer)
    clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    highlightPaths.value = new Set()
  }, 1600)
}

function teardown(): void {
  off?.()
  off = null
}

watch(selectedKey, async (key) => {
  teardown()
  value.value = undefined
  updates.value = 0
  highlightPaths.value = new Set()
  if (!key || !rpc.value)
    return
  loading.value = true
  try {
    const state = await rpc.value.sharedState.get(key as never)
    value.value = state.value()
    off = state.on('updated', (full: unknown) => {
      const changes = diffPaths(value.value, full)
      value.value = full
      updates.value++
      flash(changes)
    })
  }
  finally {
    loading.value = false
  }
})

onScopeDispose(() => {
  teardown()
  if (flashTimer)
    clearTimeout(flashTimer)
})
</script>

<template>
  <div class="split">
    <aside class="keys">
      <div class="keys-head">
        <span>{{ filteredKeys.length }} keys</span>
        <label class="checkbox">
          <input v-model="showInternal" type="checkbox"> internal
        </label>
      </div>
      <div class="keys-list">
        <div v-if="!keys" class="empty">
          Loading…
        </div>
        <div v-else-if="filteredKeys.length === 0" class="empty">
          No shared state{{ keys.length ? ' (toggle internal)' : '' }}.
        </div>
        <button
          v-for="key in filteredKeys"
          :key="key"
          class="key-item"
          :class="{ active: selectedKey === key }"
          :title="key"
          @click="selectedKey = key"
        >
          {{ key }}
        </button>
      </div>
    </aside>

    <section class="state-main">
      <div v-if="!selectedKey" class="center">
        Select a shared-state key to inspect its live value.
      </div>
      <div v-else-if="loading" class="center">
        Loading state…
      </div>
      <template v-else>
        <div class="state-meta">
          <span class="state-key">{{ selectedKey }}</span>
          <span v-if="!isStatic()" class="pulse">live{{ updates ? ` · ${updates} update${updates > 1 ? 's' : ''}` : '' }}</span>
          <span v-else class="note">static snapshot</span>
        </div>
        <JsonView :value="value" :expand-depth="3" :highlight-paths="highlightPaths" />
      </template>
    </section>
  </div>
</template>
