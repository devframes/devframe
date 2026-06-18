<script setup lang="ts">
import { historyRecords, isRecording, clearHistory } from '../composables/history'
import JsonView from './JsonView.vue'
import { computed } from 'vue'

function formatTime(ms: number) {
  const date = new Date(ms)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`
}

</script>

<template>
  <div class="pane flex-col">
    <div class="toolbar">
      <button class="btn" :class="{ ghost: !isRecording }" @click="isRecording = !isRecording">
        {{ isRecording ? 'Recording (click to pause)' : 'Paused (click to record)' }}
      </button>
      <button class="btn ghost" @click="clearHistory">Clear</button>
      <span class="muted">{{ historyRecords.length }} records</span>
    </div>
    <div v-if="historyRecords.length === 0" class="center">No history yet.</div>
    <div v-else style="padding: 14px; display: flex; flex-direction: column; gap: 14px;">
      <div v-for="rec in historyRecords" :key="rec.id" style="border: 1px solid var(--df-border); border-radius: var(--df-radius); background: var(--df-bg-soft); padding: 12px;">
        
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
          <span class="muted" style="font-family: var(--df-mono); font-size: 11px;">{{ formatTime(rec.time) }}</span>
          
          <template v-if="rec.type === 'call'">
            <span class="badge action">RPC Call</span>
            <span style="font-family: var(--df-mono); font-weight: 600; font-size: 12.5px;">{{ rec.method }}</span>
            <span class="muted">{{ rec.duration }}ms</span>
          </template>
          
          <template v-else>
            <span class="badge static">State Update</span>
            <span style="font-family: var(--df-mono); font-weight: 600; font-size: 12.5px; color: var(--df-accent);">{{ rec.key }}</span>
            <span class="muted">Sync ID: {{ rec.syncId }}</span>
          </template>
        </div>

        <div style="padding-left: 8px; border-left: 2px solid var(--df-border-soft);">
          <template v-if="rec.type === 'call'">
            <div class="label" style="margin-top: 0;">Arguments</div>
            <JsonView :value="rec.args" :expand-depth="1" />
            
            <template v-if="'result' in rec">
              <div class="label">Result</div>
              <JsonView :value="rec.result" :expand-depth="1" />
            </template>
            <template v-else-if="'error' in rec">
              <div class="label" style="color: var(--df-danger)">Error</div>
              <JsonView :value="rec.error" :expand-depth="1" />
            </template>
          </template>

          <template v-else>
            <template v-if="'value' in rec">
              <div class="label" style="margin-top: 0;">New State</div>
              <JsonView :value="rec.value" :expand-depth="1" />
            </template>
            <template v-else-if="'patches' in rec">
              <div class="label" style="margin-top: 0;">Patches</div>
              <JsonView :value="rec.patches" :expand-depth="1" />
            </template>
          </template>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.flex-col {
  display: flex;
  flex-direction: column;
}
</style>
