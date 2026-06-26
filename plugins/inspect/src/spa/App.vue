<script setup lang="ts">
import { iconButton, nav, navBrand, tab as tabClass, tabsList } from '@internal/design/components'
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

const tabs: { id: Tab, label: string, icon: string }[] = [
  { id: 'functions', label: 'Functions', icon: 'i-ph-function-duotone' },
  { id: 'state', label: 'State', icon: 'i-ph-database-duotone' },
  { id: 'agent', label: 'Agent', icon: 'i-ph-robot-duotone' },
  { id: 'history', label: 'History', icon: 'i-ph-clock-counter-clockwise-duotone' },
]

onMounted(connect)
</script>

<template>
  <div class="app">
    <header :class="nav()">
      <div :class="navBrand()">
        <span class="i-ph-magnifying-glass-duotone text-base color-active" />
        <span>Devframe Inspector</span>
      </div>

      <nav :class="tabsList()" role="tablist" aria-label="Inspector views">
        <button
          v-for="t in tabs"
          :key="t.id"
          :class="tabClass()"
          :data-state="tab === t.id ? 'active' : 'inactive'"
          role="tab"
          :aria-selected="tab === t.id"
          @click="tab = t.id"
        >
          <span :class="t.icon" />
          {{ t.label }}
        </button>
      </nav>

      <div class="flex-1" />

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
        :class="iconButton({ variant: 'ghost', size: 'sm' })"
        :title="loading ? 'Refreshing…' : 'Refresh'"
        :disabled="loading || !connection.connected"
        @click="refresh"
      >
        <span class="i-ph-arrows-clockwise" :class="{ 'animate-spin': loading }" />
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
