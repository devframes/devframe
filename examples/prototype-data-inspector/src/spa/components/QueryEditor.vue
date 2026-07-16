<script setup lang="ts">
import type { SuggestItem } from '../../rpc-contract'
import type { SyntaxState } from '../composables/workbench'
import { ref, watch } from 'vue'

const props = defineProps<{
  syntax: SyntaxState
  suggestions: SuggestItem[]
}>()

const emit = defineEmits<{
  run: []
  suggest: [pos: number]
  accept: [item: SuggestItem]
  dismiss: []
}>()

const query = defineModel<string>({ default: '' })

const textareaEl = ref<HTMLTextAreaElement | null>(null)
const active = ref(0)

watch(() => props.suggestions, () => {
  active.value = 0
})

function caretPos(): number {
  return textareaEl.value?.selectionStart ?? query.value.length
}

function onInput(): void {
  emit('suggest', caretPos())
}

function onBlur(): void {
  // Delayed so a mousedown-accept on a suggestion lands first.
  setTimeout(emit, 150, 'dismiss')
}

function accept(item: SuggestItem): void {
  emit('accept', item)
  requestAnimationFrame(() => {
    const caret = item.from + item.value.length
    textareaEl.value?.setSelectionRange(caret, caret)
    textareaEl.value?.focus()
  })
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    emit('run')
    return
  }
  if (e.ctrlKey && e.key === ' ') {
    e.preventDefault()
    emit('suggest', caretPos())
    return
  }
  const list = props.suggestions
  if (!list.length)
    return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length
  }
  else if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault()
    accept(list[active.value])
  }
  else if (e.key === 'Escape') {
    active.value = 0
    emit('dismiss')
  }
}
</script>

<template>
  <div class="flex flex-col gap-2 h-full min-h-0">
    <div class="relative flex flex-1 min-h-24">
      <textarea
        ref="textareaEl"
        v-model="query"
        spellcheck="false"
        placeholder="jora query, runs as you type. Ctrl+Space for suggestions, Ctrl+Enter to run now"
        class="flex-1 w-full resize-none font-mono text-13px leading-relaxed color-base bg-secondary border border-base rounded-lg px-3 py-2.5 outline-none transition-colors focus:border-primary-600/50 dark:focus:border-primary-400/50"
        :class="{ 'border-red-600/60! dark:border-red-400/60!': syntax.kind === 'error' }"
        @input="onInput"
        @keydown="onKeydown"
        @blur="onBlur"
      />
      <!-- Solid, elevated popover: explicit surface colors so nothing shows
           through, distinct from the page bg in both schemes. -->
      <div
        v-if="suggestions.length"
        class="absolute left-3 top-12 z-dropdown min-w-64 max-w-90% max-h-60 overflow-auto bg-white dark:bg-#1e1e1e border border-base rounded-lg shadow-xl"
      >
        <button
          v-for="(item, i) in suggestions"
          :key="`${item.value}-${i}`"
          type="button"
          class="w-full flex items-center justify-between gap-4 px-2.5 py-1 text-left font-mono text-xs"
          :class="i === active ? 'bg-#8882 color-active' : 'color-base'"
          @mousedown.prevent="accept(item)"
        >
          <span>{{ item.value }}</span>
          <span class="color-faint text-11px">{{ item.type }}</span>
        </button>
      </div>
    </div>

    <pre
      v-if="syntax.kind === 'error'"
      class="m-0 px-3 py-2 font-mono text-11px leading-relaxed whitespace-pre-wrap break-all rounded-lg border border-red-600/40 bg-red-500:8 color-red-700 dark:(border-red-400/40 color-red-300)"
    >{{ syntax.message }}</pre>
    <div
      v-else-if="syntax.kind === 'pending'"
      class="px-3 py-1.5 font-mono text-11px rounded-lg border border-amber-600/40 bg-amber-500:8 color-amber-700 dark:(border-amber-400/40 color-amber-300)"
    >
      incomplete query, keep typing
    </div>
  </div>
</template>
