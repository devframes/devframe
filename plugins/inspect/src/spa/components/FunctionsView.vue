<script setup lang="ts">
import type { InvokeResult, RpcFunctionInfo } from '@devframes/plugin-inspect/client'
import { computed, onMounted, reactive, ref, shallowRef } from 'vue'
import { useRefreshProvider } from '../composables/refresh'
import { isStatic, useRpc } from '../composables/rpc'
import JsonView from './JsonView.vue'

const rpc = useRpc()
const functions = shallowRef<RpcFunctionInfo[] | null>(null)
const search = ref('')
const expanded = ref<string | null>(null)
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

const grouped = computed(() => {
  const groups = new Map<string, RpcFunctionInfo[]>()
  for (const fn of filtered.value) {
    const ns = namespaceOf(fn.name)
    if (!groups.has(ns))
      groups.set(ns, [])
    groups.get(ns)!.push(fn)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
})

const typeStats = computed(() => {
  const stats: Record<string, number> = {}
  for (const fn of functions.value ?? [])
    stats[fn.type] = (stats[fn.type] || 0) + 1
  return stats
})

function namespaceOf(name: string): string {
  const parts = name.split(':')
  return parts.length <= 1 ? '(unnamespaced)' : parts.slice(0, -1).join(':')
}

function shortName(name: string): string {
  return name.split(':').at(-1)!
}

function toggle(fn: RpcFunctionInfo): void {
  expanded.value = expanded.value === fn.name ? null : fn.name
  if (argsInput[fn.name] === undefined)
    argsInput[fn.name] = '[]'
}

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

    <div v-if="!functions" class="center">
      Loading functions…
    </div>
    <div v-else-if="filtered.length === 0" class="empty">
      No functions match “{{ search }}”.
    </div>

    <div v-for="[ns, fns] in grouped" :key="ns" class="group">
      <div class="group-head">
        <span class="ns">{{ ns }}</span>
        <span class="badge flag">{{ fns.length }}</span>
      </div>
      <div v-for="fn in fns" :key="fn.name" class="fn-row">
        <div class="fn-head" :class="{ clickable: fn.invokable || !!fn.agent || fn.hasArgs || fn.hasReturns }" @click="toggle(fn)">
          <svg class="chev" :class="{ open: expanded === fn.name }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6" /></svg>
          <span class="fn-name" :title="fn.name">{{ shortName(fn.name) }}</span>
          <span class="fn-flags">
            <span class="badge" :class="fn.type">{{ fn.type }}</span>
            <span v-if="fn.agent" class="badge agent" title="Exposed to agents">agent</span>
            <span v-if="fn.jsonSerializable" class="badge flag" title="Strict JSON wire serialization">json</span>
            <span v-if="fn.snapshot" class="badge flag" title="Baked into the static build dump">snapshot</span>
            <span v-if="fn.hasArgs" class="badge flag">args</span>
            <span v-if="fn.hasReturns" class="badge flag">returns</span>
            <span v-if="fn.hasDump" class="badge flag">dump</span>
          </span>
        </div>

        <div v-if="expanded === fn.name" class="fn-detail">
          <p v-if="fn.agent" class="desc">
            {{ fn.agent.description }}
          </p>

          <template v-if="fn.argsSchema">
            <div class="label">
              Args schema
            </div>
            <JsonView :value="fn.argsSchema" :expand-depth="0" />
          </template>
          <template v-if="fn.returnsSchema">
            <div class="label">
              Returns schema
            </div>
            <JsonView :value="fn.returnsSchema" :expand-depth="0" />
          </template>

          <template v-if="fn.invokable">
            <div class="label">
              Invoke — positional args as a JSON array
            </div>
            <textarea v-model="argsInput[fn.name]" class="args" spellcheck="false" placeholder="[]" />
            <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
              <button class="btn" :disabled="pending[fn.name] || isStatic()" @click="invoke(fn)">
                {{ pending[fn.name] ? 'Invoking…' : 'Invoke' }}
              </button>
              <span v-if="isStatic()" class="note">read-only static backend — invocation disabled</span>
            </div>
            <div v-if="results[fn.name]" class="result">
              <div class="result-head">
                <span v-if="results[fn.name].ok" class="ok">✓ resolved</span>
                <span v-else class="fail">✕ threw</span>
                <span v-if="'durationMs' in results[fn.name]" class="muted">{{ (results[fn.name] as InvokeResult).durationMs }}ms</span>
              </div>
              <JsonView
                v-if="results[fn.name].ok"
                :value="(results[fn.name] as InvokeResult).result"
                :expand-depth="2"
              />
              <JsonView v-else :value="(results[fn.name] as InvokeResult).error" :expand-depth="2" />
            </div>
          </template>
          <p v-else class="note">
            {{ fn.type }} functions may carry side effects — the inspector does not invoke them.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
