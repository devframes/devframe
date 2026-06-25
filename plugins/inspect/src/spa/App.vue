<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AgentSmart from './components/AgentSmart.vue'
import FunctionsSmart from './components/FunctionsSmart.vue'
import HistorySmart from './components/HistorySmart.vue'
import StateSmart from './components/StateSmart.vue'
import { useRefresh } from './composables/refresh'
import { connect, connection } from './composables/rpc'

type Tab = 'functions' | 'state' | 'agent' | 'history'

const tab = ref<Tab>('functions')
const { refresh, loading } = useRefresh()

const tabs: { id: Tab, label: string }[] = [
  { id: 'functions', label: 'Functions' },
  { id: 'state', label: 'State' },
  { id: 'agent', label: 'Agent' },
  { id: 'history', label: 'History' },
]

onMounted(connect)
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="brand">
        <span class="dot" />
        <span>Inspector</span>
        <small>RPC &amp; State</small>
      </div>

      <nav class="tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="tab"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </nav>

      <div class="header-spacer" />

      <div
        class="conn"
        :class="{ ok: connection.connected, err: !!connection.error }"
      >
        <span class="led" />
        <span v-if="connection.error">disconnected</span>
        <span v-else-if="connection.connected">{{ connection.backend }}</span>
        <span v-else>connecting…</span>
      </div>

      <button
        class="icon-btn"
        :class="{ spin: loading }"
        title="Refresh"
        :disabled="loading || !connection.connected"
        @click="refresh"
      >
        <div class="i-ph-arrows-clockwise-duotone" />
      </button>
    </header>

    <main class="app-body">
      <div v-if="connection.error" class="center error">
        <div>Failed to connect to the devframe backend.</div>
        <code>{{ connection.error }}</code>
      </div>
      <div v-else-if="!connection.connected" class="center">
        Connecting to devframe…
      </div>
      <template v-else>
        <FunctionsSmart v-if="tab === 'functions'" />
        <StateSmart v-else-if="tab === 'state'" />
        <AgentSmart v-else-if="tab === 'agent'" />
        <HistorySmart v-else-if="tab === 'history'" />
      </template>
    </main>
  </div>
</template>
