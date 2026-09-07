<script setup lang="ts">
import type { ClientWebMcpState } from '../composables/client'
import type { InvokeResult, RpcFunctionInfo } from '../connect'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { reactive, ref } from 'vue'
import FunctionRow from './FunctionRow.vue'
import JsonView from './JsonView.vue'

defineProps<{
  functions: RpcFunctionInfo[] | null
  webmcp: ClientWebMcpState | null
  results: Record<string, InvokeResult | { ok: false, error: { name: string, message: string } }>
  pending: Record<string, boolean>
}>()

const emit = defineEmits<{
  (e: 'invoke', fn: RpcFunctionInfo, parsedArgs: unknown[]): void
  (e: 'invokeTool', name: string, parsedArgs: Record<string, unknown>): void
}>()

const argsInput = reactive<Record<string, string>>({})
const toolArgsInput = reactive<Record<string, string>>({})
const expanded = ref<string | null>(null)

/** Result/pending key for a WebMCP tool, kept apart from function names. */
function toolKey(name: string): string {
  return `webmcp:${name}`
}

function toggleTool(name: string): void {
  expanded.value = expanded.value === name ? null : name
  toolArgsInput[name] ??= '{}'
}

function invoke(fn: RpcFunctionInfo): void {
  let parsed: unknown[]
  try {
    const raw = JSON.parse(argsInput[fn.name] || '[]')
    parsed = Array.isArray(raw) ? raw : [raw]
  }
  catch (e) {
    throw new Error(`Invalid JSON args: ${(e as Error).message}`)
  }
  emit('invoke', fn, parsed)
}

function invokeTool(name: string): void {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(toolArgsInput[name] || '{}')
  }
  catch (e) {
    throw new Error(`Invalid JSON args: ${(e as Error).message}`)
  }
  emit('invokeTool', name, parsed)
}
</script>

<template>
  <div class="pane">
    <div v-if="!functions || !webmcp" class="center">
      Loading client surface…
    </div>
    <template v-else>
      <div class="section-title">
        Client functions · {{ functions.length }}
      </div>
      <div v-if="functions.length === 0" class="empty">
        No client RPC functions registered in this page.
      </div>
      <div v-else class="fn-list">
        <FunctionRow
          v-for="fn in functions"
          :key="fn.name"
          :fn="fn"
          :args-input="argsInput"
          :results="results"
          :pending="pending"
          :is-static="false"
          @invoke="invoke"
          @update-args="(n, v) => argsInput[n] = v"
        />
      </div>

      <div class="section-title">
        WebMCP tools · {{ webmcp.tools.length }}
      </div>
      <p class="note">
        <template v-if="webmcp.live">
          Live from this page's WebMCP model context.
        </template>
        <template v-else-if="webmcp.available">
          This page's model context supports registration only; showing the tools projected from agent-flagged client functions.
        </template>
        <template v-else>
          This browser provides no WebMCP model context; showing the tools devframe would register on one.
        </template>
      </p>
      <div v-if="webmcp.tools.length === 0" class="empty">
        No WebMCP tools on this page.
      </div>
      <div v-else class="cards">
        <div v-for="tool in webmcp.tools" :key="tool.name" class="card">
          <div class="card-head" style="cursor: pointer; user-select: none;" @click="toggleTool(tool.name)">
            <div class="chev i-ph-caret-right" :class="{ open: expanded === tool.name }" />
            <span class="card-title">{{ tool.name }}</span>
            <span class="badge flag">{{ webmcp.live ? 'live' : 'projected' }}</span>
            <span v-if="tool.origin" class="badge flag">{{ tool.origin }}</span>
          </div>
          <div v-if="tool.source" class="id">
            client function: {{ tool.source }}
          </div>
          <p v-if="tool.description" class="desc">
            {{ tool.description }}
          </p>
          <template v-if="expanded === tool.name">
            <template v-if="tool.inputSchema">
              <div class="label">
                Input schema
              </div>
              <JsonView :value="tool.inputSchema" :expand-depth="1" />
            </template>

            <template v-if="webmcp.executable">
              <div class="label">
                Invoke (WebMCP args object)
              </div>
              <textarea v-model="toolArgsInput[tool.name]" class="args" spellcheck="false" placeholder="{}" />
              <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
                <ActionButton
                  variant="primary"
                  size="sm"
                  icon="i-ph-play-duotone"
                  :loading="pending[toolKey(tool.name)]"
                  :disabled="pending[toolKey(tool.name)]"
                  @click="invokeTool(tool.name)"
                >
                  {{ pending[toolKey(tool.name)] ? 'Invoking…' : 'Invoke' }}
                </ActionButton>
              </div>
            </template>
            <p v-else-if="tool.source" class="note">
              Invoke the backing client function from the list above.
            </p>
            <p v-else class="note">
              This model context does not expose tool execution to the page.
            </p>

            <div v-if="results[toolKey(tool.name)]" class="result">
              <div class="result-head">
                <span v-if="results[toolKey(tool.name)].ok" class="ok">✓ resolved</span>
                <span v-else class="fail">✕ threw</span>
                <span v-if="'durationMs' in results[toolKey(tool.name)]" class="muted">{{ (results[toolKey(tool.name)] as InvokeResult).durationMs }}ms</span>
              </div>
              <JsonView
                v-if="results[toolKey(tool.name)].ok"
                :value="(results[toolKey(tool.name)] as InvokeResult).result"
                :expand-depth="2"
              />
              <JsonView v-else :value="(results[toolKey(tool.name)] as InvokeResult).error" :expand-depth="2" />
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
