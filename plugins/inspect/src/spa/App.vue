<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import LayoutTabs from '@antfu/design/components/Layout/LayoutTabs.vue'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'
import { computed, onMounted, ref } from 'vue'
import {
  button,
  connectionBody,
  connectionDetail,
  connectionGlyph,
  connectionIndicator,
  connectionPanel,
  connectionState,
  connectionTitle,
} from '../../../../design/design'
import AgentSmart from './components/AgentSmart.vue'
import FunctionsSmart from './components/FunctionsSmart.vue'
import HistorySmart from './components/HistorySmart.vue'
import StateSmart from './components/StateSmart.vue'
import { useRefresh } from './composables/refresh'
import { connect, connection } from './composables/rpc'

type Tab = 'functions' | 'state' | 'agent' | 'history'

const tab = ref<Tab>('functions')
const { refresh, loading } = useRefresh()

// The shared connection indicator (dot + label) surfaces only while the
// connection is not live; when connected it renders nothing.
const conn = computed(() => connectionIndicator(connection.status))

// The shared full-panel connection state takes over the body until the client
// is connected.
const connState = computed(() => connectionState(connection.status))

const tabs: { value: Tab, label: string, icon: string }[] = [
  { value: 'functions', label: 'Functions', icon: 'i-ph-function-duotone' },
  { value: 'state', label: 'State', icon: 'i-ph-database-duotone' },
  { value: 'agent', label: 'Agent', icon: 'i-ph-robot-duotone' },
  { value: 'history', label: 'History', icon: 'i-ph-clock-counter-clockwise-duotone' },
]

onMounted(connect)

// The client doesn't auto-reconnect; a reload re-runs the whole handshake.
function reload(): void {
  location.reload()
}
</script>

<template>
  <div class="app">
    <LayoutToolbar :glass="false" class="h-nav">
      <div class="flex items-center gap-1.5 shrink-0 font-semibold text-sm select-none">
        <span class="i-ph-magnifying-glass-duotone text-base color-active" />
        <span>Devframe Inspector</span>
      </div>

      <LayoutTabs v-model="tab" :tabs="tabs" variant="segment" />

      <template #search>
        <div />
      </template>

      <template #end>
        <span v-if="conn" :class="conn.class">
          <span :class="conn.dot" />
          {{ conn.label }}
        </span>

        <ActionIconButton
          class="text-sm"
          :icon="loading ? 'i-ph-arrows-clockwise animate-spin' : 'i-ph-arrows-clockwise'"
          :tooltip="loading ? 'Refreshing…' : 'Refresh'"
          label="Refresh"
          :disabled="loading || !connection.connected"
          @click="refresh"
        />
      </template>
    </LayoutToolbar>

    <main class="app-body">
      <div v-if="connState" :class="connectionPanel('h-full')">
        <span :class="[connState.icon, connectionGlyph(connState.spin)]" />
        <div class="flex flex-col gap-1">
          <p :class="connectionTitle()">
            {{ connState.title }}
          </p>
          <p :class="connectionBody()">
            {{ connState.body }}
          </p>
          <p v-if="connection.error && connection.status === 'error'" :class="connectionDetail()">
            {{ connection.error }}
          </p>
        </div>
        <button v-if="connState.reloadable" type="button" :class="button({ variant: 'primary', size: 'sm' })" @click="reload">
          <span class="i-ph-arrow-clockwise" />
          Reload
        </button>
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
