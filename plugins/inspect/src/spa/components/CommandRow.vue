<script setup lang="ts">
import type { DevframeInspectCommandInfo } from '@devframes/plugin-inspect/client'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { computed, ref } from 'vue'
import JsonView from './JsonView.vue'

defineOptions({ name: 'CommandRow' })

const props = defineProps<{
  cmd: DevframeInspectCommandInfo
  argsInput: Record<string, string>
  results: Record<string, any>
  pending: Record<string, boolean>
  isStatic: boolean
  /** Nesting depth — 0 for top-level commands, 1 for their children. */
  depth?: number
}>()

const emit = defineEmits<{
  (e: 'execute', cmd: DevframeInspectCommandInfo): void
  (e: 'updateArgs', id: string, value: string): void
}>()

const expanded = ref(false)

const clickable = computed(() =>
  props.cmd.hasHandler || !!props.cmd.description || !!props.cmd.children?.length,
)

function toggle(): void {
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="fn-row" :class="{ 'cmd-row-child': depth }">
    <div class="fn-head" :class="{ clickable }" @click="toggle">
      <div class="chev i-ph-caret-right" :class="{ open: expanded }" />
      <span v-if="cmd.icon" :class="typeof cmd.icon === 'string' ? cmd.icon : 'i-ph-terminal-window-duotone'" class="cmd-icon" />
      <span class="cmd-title">{{ cmd.title }}</span>
      <span class="cmd-id mono">{{ cmd.id }}</span>
      <span class="fn-flags">
        <span v-if="cmd.category" class="badge flag">{{ cmd.category }}</span>
        <span v-if="!cmd.hasHandler" class="badge flag" title="No handler — a group for its children">group</span>
        <span v-if="cmd.children?.length" class="badge flag">{{ cmd.children.length }} children</span>
      </span>
    </div>

    <div v-if="expanded" class="fn-detail">
      <p v-if="cmd.description" class="desc">
        {{ cmd.description }}
      </p>

      <template v-if="cmd.hasHandler">
        <div class="label">
          Execute — positional args as a JSON array
        </div>
        <textarea :value="argsInput[cmd.id]" class="args" spellcheck="false" placeholder="[]" @input="emit('updateArgs', cmd.id, ($event.target as HTMLTextAreaElement).value)" />
        <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
          <ActionButton
            variant="primary"
            size="sm"
            icon="i-ph-play-duotone"
            :loading="pending[cmd.id]"
            :disabled="pending[cmd.id] || isStatic"
            @click.stop="emit('execute', cmd)"
          >
            {{ pending[cmd.id] ? 'Running…' : 'Run' }}
          </ActionButton>
          <span v-if="isStatic" class="note">read-only static backend — execution disabled</span>
        </div>
        <div v-if="results[cmd.id]" class="result">
          <div class="result-head">
            <span v-if="results[cmd.id].ok" class="ok">✓ resolved</span>
            <span v-else class="fail">✕ threw</span>
            <span v-if="'durationMs' in results[cmd.id]" class="muted">{{ results[cmd.id].durationMs }}ms</span>
          </div>
          <JsonView
            v-if="results[cmd.id].ok"
            :value="results[cmd.id].result"
            :expand-depth="2"
          />
          <JsonView v-else :value="results[cmd.id].error" :expand-depth="2" />
        </div>
      </template>
      <p v-else-if="!cmd.children?.length" class="note">
        Group-only command — no handler to run.
      </p>

      <template v-if="cmd.children?.length">
        <div class="label">
          Children
        </div>
        <div class="cmd-children">
          <CommandRow
            v-for="child in cmd.children"
            :key="child.id"
            :cmd="child"
            :args-input="argsInput"
            :results="results"
            :pending="pending"
            :is-static="isStatic"
            :depth="(depth ?? 0) + 1"
            @execute="emit('execute', $event)"
            @update-args="(id, value) => emit('updateArgs', id, value)"
          />
        </div>
      </template>
    </div>
  </div>
</template>
