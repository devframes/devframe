<script setup lang="ts">
import { computed, ref } from 'vue'
import JsonView from './JsonView.vue'

const props = defineProps<{
  keys: string[] | null
  selectedKey: string | null
  value: unknown
  loading: boolean
  isStatic: boolean
  updates: number
  highlightPaths: Set<string>
}>()

const emit = defineEmits<{
  (e: 'select', key: string): void
}>()

const showInternal = ref(false)

const filteredKeys = computed(() => {
  const list = props.keys ?? []
  if (showInternal.value)
    return list
  return list.filter(k => !k.startsWith('devframe:') && !k.startsWith('__'))
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
          @click="emit('select', key)"
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
          <span v-if="!isStatic" class="pulse">live{{ updates ? ` · ${updates} update${updates > 1 ? 's' : ''}` : '' }}</span>
          <span v-else class="note">static snapshot</span>
        </div>
        <JsonView :value="value" :expand-depth="3" :highlight-paths="highlightPaths" />
      </template>
    </section>
  </div>
</template>
