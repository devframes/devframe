<script setup lang="ts">
import type { RpcFunctionInfo } from '@devframes/plugin-inspect/client'
import { button } from '@internal/design/components'
import { computed, ref } from 'vue'
import FunctionName from './FunctionName.vue'
import JsonView from './JsonView.vue'

const props = defineProps<{
  fn: RpcFunctionInfo
  argsInput: Record<string, string>
  results: Record<string, any>
  pending: Record<string, boolean>
  isStatic: boolean
}>()

const emit = defineEmits<{
  (e: 'invoke', fn: RpcFunctionInfo): void
  (e: 'updateArgs', name: string, value: string): void
}>()

const expanded = ref(false)

const clickable = computed(() =>
  props.fn.invokable || !!props.fn.agent || props.fn.hasArgs || props.fn.hasReturns,
)

function toggle(): void {
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="fn-row">
    <div class="fn-head" :class="{ clickable }" @click="toggle">
      <div class="chev i-ph-caret-right" :class="{ open: expanded }" />
      <FunctionName :name="fn.name" />
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

    <div v-if="expanded" class="fn-detail">
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
        <textarea :value="argsInput[fn.name]" class="args" spellcheck="false" placeholder="[]" @input="emit('updateArgs', fn.name, ($event.target as HTMLTextAreaElement).value)" />
        <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
          <button :class="button({ variant: 'primary', size: 'sm' })" :disabled="pending[fn.name] || isStatic" @click.stop="emit('invoke', fn)">
            <span class="i-ph-play-duotone" />
            {{ pending[fn.name] ? 'Invoking…' : 'Invoke' }}
          </button>
          <span v-if="isStatic" class="note">read-only static backend — invocation disabled</span>
        </div>
        <div v-if="results[fn.name]" class="result">
          <div class="result-head">
            <span v-if="results[fn.name].ok" class="ok">✓ resolved</span>
            <span v-else class="fail">✕ threw</span>
            <span v-if="'durationMs' in results[fn.name]" class="muted">{{ results[fn.name].durationMs }}ms</span>
          </div>
          <JsonView
            v-if="results[fn.name].ok"
            :value="results[fn.name].result"
            :expand-depth="2"
          />
          <JsonView v-else :value="results[fn.name].error" :expand-depth="2" />
        </div>
      </template>
      <p v-else class="note">
        {{ fn.type }} functions may carry side effects — the inspector does not invoke them.
      </p>
    </div>
  </div>
</template>
