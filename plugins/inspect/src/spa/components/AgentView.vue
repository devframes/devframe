<script setup lang="ts">
import type { AgentManifest, InvokeResult } from '@devframes/plugin-inspect/client'
import { ref, reactive } from 'vue'
import JsonView from './JsonView.vue'

const props = defineProps<{
  manifest: AgentManifest | null
  isStatic: boolean
  results: Record<string, InvokeResult | { ok: false, error: { name: string, message: string } }>
  pending: Record<string, boolean>
}>()

const emit = defineEmits<{
  (e: 'invoke', id: string, parsedArgs: unknown): void
  (e: 'read', id: string): void
}>()

const expanded = ref<string | null>(null)
const argsInput = reactive<Record<string, string>>({})

function toggle(id: string): void {
  expanded.value = expanded.value === id ? null : id
  if (argsInput[id] === undefined) {
    argsInput[id] = '{}'
  }
}

function invokeTool(id: string) {
  let parsed: unknown
  try {
    const raw = JSON.parse(argsInput[id] || '{}')
    parsed = raw
  } catch (err) {
    // Emitting error would be cleaner, for now we will throw to stop execution
    throw new Error(`Invalid JSON args: ${(err as Error).message}`)
  }
  emit('invoke', id, parsed)
}

function readResource(id: string) {
  emit('read', id)
}
</script>

<template>
  <div class="pane">
    <div v-if="!manifest" class="center">
      Loading agent surface…
    </div>
    <template v-else>
      <div class="section-title">
        Tools · {{ manifest.tools.length }}
      </div>
      <div v-if="manifest.tools.length === 0" class="empty">
        No agent-exposed tools.
      </div>
      <div v-else class="cards">
        <div v-for="tool in manifest.tools" :key="tool.id" class="card">
          <div class="card-head" style="cursor: pointer; user-select: none;" @click="toggle(tool.id)">
            <div class="chev i-ph-caret-right" :class="{ open: expanded === tool.id }" />
            <span class="card-title">{{ tool.title }}</span>
            <span class="badge flag">{{ tool.kind }}</span>
            <span class="badge" :class="`safety-${tool.safety}`">{{ tool.safety }}</span>
          </div>
          <div class="id">
            {{ tool.id }}
          </div>
          <p class="desc">
            {{ tool.description }}
          </p>
          <div v-if="tool.tags && tool.tags.length" class="tags">
            <span v-for="tag in tool.tags" :key="tag" class="badge flag">{{ tag }}</span>
          </div>
          <template v-if="expanded === tool.id">
            <template v-if="tool.inputSchema">
              <div class="label">Input schema</div>
              <JsonView :value="tool.inputSchema" :expand-depth="1" />
            </template>
            <template v-if="tool.outputSchema">
              <div class="label">Output schema</div>
              <JsonView :value="tool.outputSchema" :expand-depth="1" />
            </template>
            <template v-if="tool.examples && tool.examples.length">
              <div class="label">Examples</div>
              <JsonView :value="tool.examples" :expand-depth="1" />
            </template>

            <div class="label">Invoke (MCP format)</div>
            <textarea v-model="argsInput[tool.id]" class="args" spellcheck="false" placeholder="{}" />
            <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
              <button class="btn" :disabled="pending[tool.id] || isStatic" @click="invokeTool(tool.id)">
                {{ pending[tool.id] ? 'Invoking…' : 'Invoke' }}
              </button>
              <span v-if="isStatic" class="note">read-only static backend</span>
            </div>
            
            <div v-if="results[tool.id]" class="result">
              <div class="result-head">
                <span v-if="results[tool.id].ok" class="ok">✓ resolved</span>
                <span v-else class="fail">✕ threw</span>
                <span v-if="'durationMs' in results[tool.id]" class="muted">{{ (results[tool.id] as InvokeResult).durationMs }}ms</span>
              </div>
              <JsonView
                v-if="results[tool.id].ok"
                :value="(results[tool.id] as InvokeResult).result"
                :expand-depth="2"
              />
              <JsonView v-else :value="(results[tool.id] as InvokeResult).error" :expand-depth="2" />
            </div>
          </template>
        </div>
      </div>

      <div class="section-title">
        Resources · {{ manifest.resources.length }}
      </div>
      <div v-if="manifest.resources.length === 0" class="empty">
        No agent-readable resources.
      </div>
      <div v-else class="cards">
        <div v-for="res in manifest.resources" :key="res.id" class="card">
          <div class="card-head" style="cursor: pointer; user-select: none;" @click="toggle(res.id)">
            <div class="chev i-ph-caret-right" :class="{ open: expanded === res.id }" />
            <span class="card-title">{{ res.name }}</span>
            <span v-if="res.mimeType" class="badge flag">{{ res.mimeType }}</span>
          </div>
          <div class="id">
            {{ res.uri }}
          </div>
          <p v-if="res.description" class="desc">
            {{ res.description }}
          </p>

          <template v-if="expanded === res.id">
            <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
              <button class="btn" :disabled="pending[res.id] || isStatic" @click="readResource(res.id)">
                {{ pending[res.id] ? 'Reading…' : 'Read Resource' }}
              </button>
              <span v-if="isStatic" class="note">read-only static backend</span>
            </div>
            
            <div v-if="results[res.id]" class="result">
              <div class="result-head">
                <span v-if="results[res.id].ok" class="ok">✓ resolved</span>
                <span v-else class="fail">✕ threw</span>
                <span v-if="'durationMs' in results[res.id]" class="muted">{{ (results[res.id] as InvokeResult).durationMs }}ms</span>
              </div>
              <JsonView
                v-if="results[res.id].ok"
                :value="(results[res.id] as InvokeResult).result"
                :expand-depth="2"
              />
              <JsonView v-else :value="(results[res.id] as InvokeResult).error" :expand-depth="2" />
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
