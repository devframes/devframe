<script setup lang="ts">
import type { DevframeViewBuiltin } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import { computed, ref } from 'vue'
import { t } from '../../i18n'
import SettingsAdvanced from './SettingsAdvanced.vue'
import SettingsAppearance from './SettingsAppearance.vue'
import SettingsDocks from './SettingsDocks.vue'
import SettingsShortcuts from './SettingsShortcuts.vue'

defineProps<{
  context: DocksContext
  entry: DevframeViewBuiltin
}>()

const tabs = computed(() => [
  { id: 'appearance', label: t('settings.appearance'), icon: 'i-ph-paint-brush-duotone' },
  { id: 'docks', label: t('settings.docks'), icon: 'i-ph-layout-duotone' },
  { id: 'shortcuts', label: t('settings.shortcuts'), icon: 'i-ph-keyboard-duotone' },
  { id: 'advanced', label: t('settings.advanced'), icon: 'i-ph-wrench-duotone' },
] as const)

type TabId = (typeof tabs)['value'][number]['id']
const activeTab = ref<TabId>('appearance')
</script>

<template>
  <div class="h-full w-full overflow-hidden flex flex-col">
    <!-- Tab bar -->
    <div class="flex items-center border-b border-base px-6 shrink-0">
      <button
        v-for="tab of tabs"
        :key="tab.id"
        class="flex items-center gap-1.5 px-4 py-3 text-sm transition-colors relative"
        :class="activeTab === tab.id
          ? 'op100 text-primary'
          : 'op50 hover:op80'"
        @click="activeTab = tab.id"
      >
        <div :class="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
        <div
          v-if="activeTab === tab.id"
          class="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
        />
      </button>
    </div>

    <!-- Tab content -->
    <div class="flex-1 overflow-auto p8" style="scrollbar-gutter: stable;">
      <div class="max-w-200 mx-auto">
        <SettingsAppearance
          v-if="activeTab === 'appearance'"
          :context="context"
        />
        <SettingsShortcuts
          v-if="activeTab === 'shortcuts'"
          :context="context"
        />
        <SettingsDocks
          v-if="activeTab === 'docks'"
          :context="context"
        />
        <SettingsAdvanced
          v-if="activeTab === 'advanced'"
          :context="context"
        />
      </div>
    </div>
  </div>
</template>
