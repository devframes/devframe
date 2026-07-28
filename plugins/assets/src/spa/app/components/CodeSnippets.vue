<script setup lang="ts">
import type { CodeSnippet } from '../../../types'
import { computed, ref } from 'vue'

const props = defineProps<{ snippets: CodeSnippet[] }>()

const active = ref(0)
const copied = ref(false)
const current = computed(() => props.snippets[Math.min(active.value, props.snippets.length - 1)])

async function copy(): Promise<void> {
  await navigator.clipboard.writeText(current.value.code)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}
</script>

<template>
  <div class="-mx-4 -mb-4 border-t border-base px-4 pb-4 pt-3">
    <div class="mb-2 flex items-center gap-1 overflow-x-auto">
      <button
        v-for="(s, i) in snippets"
        :key="s.name"
        type="button"
        class="shrink-0 rounded px-2 py-1 text-xs"
        :class="i === active ? 'bg-active color-base' : 'op-fade hover:bg-active'"
        @click="active = i"
      >
        {{ s.name }}
      </button>
      <span class="flex-1" />
      <button type="button" class="shrink-0 rounded p-1 op-fade hover:bg-active hover:op-100" title="Copy" @click="copy">
        <span :class="copied ? 'i-ph-check' : 'i-ph-copy'" />
      </button>
    </div>
    <pre class="overflow-x-auto rounded-lg bg-secondary p-3 text-xs font-mono"><code>{{ current.code }}</code></pre>
  </div>
</template>
