<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  value: unknown
  name?: string
  path?: string
  depth?: number
  expandDepth?: number
  highlightPaths?: Set<string>
}>(), {
  depth: 0,
  expandDepth: 1,
  path: '',
})

const kind = computed<'array' | 'object' | 'primitive'>(() => {
  if (Array.isArray(props.value))
    return 'array'
  if (props.value !== null && typeof props.value === 'object')
    return 'object'
  return 'primitive'
})

const entries = computed<[string, unknown][]>(() => {
  if (kind.value === 'array')
    return (props.value as unknown[]).map((v, i) => [String(i), v])
  if (kind.value === 'object')
    return Object.entries(props.value as Record<string, unknown>)
  return []
})

const open = ref(props.depth < props.expandDepth)

const isEmpty = computed(() => entries.value.length === 0)
const changed = computed(() => !!props.path && props.highlightPaths?.has(props.path))

function childPath(key: string): string {
  return props.path ? `${props.path}.${key}` : key
}

function primitiveClass(v: unknown): string {
  if (v === null || v === undefined)
    return 'v-null'
  return `v-${typeof v}`
}

function primitiveText(v: unknown): string {
  if (v === undefined)
    return 'undefined'
  if (v === null)
    return 'null'
  if (typeof v === 'string')
    return JSON.stringify(v)
  return String(v)
}

const openBracket = computed(() => (kind.value === 'array' ? '[' : '{'))
const closeBracket = computed(() => (kind.value === 'array' ? ']' : '}'))
const summary = computed(() =>
  kind.value === 'array'
    ? `[${entries.value.length}]`
    : `{${entries.value.length}}`,
)
</script>

<template>
  <div class="json">
    <!-- primitive leaf -->
    <div v-if="kind === 'primitive'" class="json-row" :class="{ changed }">
      <span v-if="name !== undefined" class="json-key">{{ name }}</span>
      <span v-if="name !== undefined" class="json-colon">:</span>
      <span :class="primitiveClass(value)">{{ primitiveText(value) }}</span>
    </div>

    <!-- empty container -->
    <div v-else-if="isEmpty" class="json-row" :class="{ changed }">
      <span v-if="name !== undefined" class="json-key">{{ name }}</span>
      <span v-if="name !== undefined" class="json-colon">:</span>
      <span class="json-meta">{{ openBracket }}{{ closeBracket }}</span>
    </div>

    <!-- expandable container -->
    <div v-else>
      <div class="json-row json-toggle" :class="{ changed }" @click="open = !open">
        <span class="json-caret" :class="{ open }">▶</span>
        <span v-if="name !== undefined" class="json-key">{{ name }}</span>
        <span v-if="name !== undefined" class="json-colon">:</span>
        <template v-if="open">
          <span class="json-meta">{{ openBracket }}</span>
        </template>
        <template v-else>
          <span class="json-meta">{{ summary }}</span>
        </template>
      </div>
      <div v-if="open" class="json-children">
        <JsonView
          v-for="[key, child] in entries"
          :key="key"
          :name="key"
          :value="child"
          :path="childPath(key)"
          :depth="depth + 1"
          :expand-depth="expandDepth"
          :highlight-paths="highlightPaths"
        />
      </div>
      <div v-if="open" class="json-row">
        <span class="json-meta">{{ closeBracket }}</span>
      </div>
    </div>
  </div>
</template>
