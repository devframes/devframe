<script setup lang="ts">
import type { RpcFunctionInfo } from '@devframes/plugin-inspect/client'
import { ref } from 'vue'
import { getHashColorFromString } from '../utils/color'
import JsonView from './JsonView.vue'

export interface TreeNode {
  name: string
  fullPath: string
  isLeaf: boolean
  children?: Record<string, TreeNode>
  fn?: RpcFunctionInfo
}

const props = defineProps<{
  node: TreeNode
  depth: number
  argsInput: Record<string, string>
  results: Record<string, any>
  pending: Record<string, boolean>
  isStatic: boolean
}>()

const emit = defineEmits<{
  (e: 'invoke', fn: RpcFunctionInfo): void
  (e: 'updateArgs', name: string, value: string): void
}>()

const expandedNode = ref(props.depth < 1)
const expandedFn = ref(false)

function toggle() {
  if (props.node.isLeaf) {
    expandedFn.value = !expandedFn.value
    if (props.node.fn && props.argsInput[props.node.fn.name] === undefined) {
      // Initialize if empty
      // Emitting an event just to set default isn't necessary because it's v-model bound
    }
  }
  else {
    expandedNode.value = !expandedNode.value
  }
}

const color = getHashColorFromString(props.node.fullPath)
</script>

<script lang="ts">
export default {
  name: 'FunctionsTreeNode',
}
</script>

<template>
  <div class="tree-node">
    <div v-if="!node.isLeaf" class="group-head" style="cursor: pointer; user-select: none;" @click="toggle">
      <div class="chev i-ph-caret-right" :class="{ open: expandedNode }" />
      <span class="ns" :style="{ color }">{{ node.name }}</span>
    </div>

    <div v-if="node.isLeaf && node.fn" class="fn-row">
      <div class="fn-head" :class="{ clickable: node.fn.invokable || !!node.fn.agent || node.fn.hasArgs || node.fn.hasReturns }" @click="toggle">
        <div class="chev i-ph-caret-right" :class="{ open: expandedFn }" />
        <span class="fn-name" :title="node.fn.name">{{ node.name }}</span>
        <span class="fn-flags">
          <span class="badge" :class="node.fn.type">{{ node.fn.type }}</span>
          <span v-if="node.fn.agent" class="badge agent" title="Exposed to agents">agent</span>
          <span v-if="node.fn.jsonSerializable" class="badge flag" title="Strict JSON wire serialization">json</span>
          <span v-if="node.fn.snapshot" class="badge flag" title="Baked into the static build dump">snapshot</span>
          <span v-if="node.fn.hasArgs" class="badge flag">args</span>
          <span v-if="node.fn.hasReturns" class="badge flag">returns</span>
          <span v-if="node.fn.hasDump" class="badge flag">dump</span>
        </span>
      </div>

      <div v-if="expandedFn" class="fn-detail">
        <p v-if="node.fn.agent" class="desc">
          {{ node.fn.agent.description }}
        </p>

        <template v-if="node.fn.argsSchema">
          <div class="label">
            Args schema
          </div>
          <JsonView :value="node.fn.argsSchema" :expand-depth="0" />
        </template>
        <template v-if="node.fn.returnsSchema">
          <div class="label">
            Returns schema
          </div>
          <JsonView :value="node.fn.returnsSchema" :expand-depth="0" />
        </template>

        <template v-if="node.fn.invokable">
          <div class="label">
            Invoke — positional args as a JSON array
          </div>
          <textarea :value="argsInput[node.fn.name]" class="args" spellcheck="false" placeholder="[]" @input="emit('updateArgs', node.fn.name, ($event.target as HTMLTextAreaElement).value)" />
          <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
            <button class="btn" :disabled="pending[node.fn.name] || isStatic()" @click.stop="emit('invoke', node.fn!)">
              {{ pending[node.fn.name] ? 'Invoking…' : 'Invoke' }}
            </button>
            <span v-if="isStatic()" class="note">read-only static backend — invocation disabled</span>
          </div>
          <div v-if="results[node.fn.name]" class="result">
            <div class="result-head">
              <span v-if="results[node.fn.name].ok" class="ok">✓ resolved</span>
              <span v-else class="fail">✕ threw</span>
              <span v-if="'durationMs' in results[node.fn.name]" class="muted">{{ results[node.fn.name].durationMs }}ms</span>
            </div>
            <JsonView
              v-if="results[node.fn.name].ok"
              :value="results[node.fn.name].result"
              :expand-depth="2"
            />
            <JsonView v-else :value="results[node.fn.name].error" :expand-depth="2" />
          </div>
        </template>
        <p v-else class="note">
          {{ node.fn.type }} functions may carry side effects — the inspector does not invoke them.
        </p>
      </div>
    </div>

    <div v-if="!node.isLeaf && expandedNode" class="children" style="padding-left: 14px; border-left: 1px solid var(--df-border-soft); margin-left: 6px;">
      <FunctionsTreeNode
        v-for="child in Object.values(node.children || {}).sort((a, b) => { if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1; return a.name.localeCompare(b.name) })"
        :key="child.name"
        :node="child"
        :depth="depth + 1"
        :args-input="argsInput"
        :results="results"
        :pending="pending"
        :is-static="isStatic"
        @invoke="emit('invoke', $event)"
        @update-args="(n, v) => emit('updateArgs', n, v)"
      />
    </div>
  </div>
</template>
