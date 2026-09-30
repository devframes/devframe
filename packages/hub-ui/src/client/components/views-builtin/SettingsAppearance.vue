<script setup lang="ts">
import type { DocksContext } from '@devframes/hub/client'
import { computed } from 'vue'
import { HUB_UI_LOCALES } from '../../../locales'
import { localePreference, t } from '../../i18n'
import { useBranding } from '../../state/branding'
import { colorSchemePreference, setColorSchemePreference } from '../../state/color-mode'
import { isDockPopupSupported, requestDockPopupOpen, useIsDockPopupOpen } from '../../state/popup'
import { useSettings } from '../../state/settings-defaults'

const props = defineProps<{
  context: DocksContext
}>()

const settings = useSettings(props.context)
const settingsStore = props.context.docks.settings
const branding = useBranding()
const panelStore = props.context.panel.store
const isEmbedded = props.context.clientType === 'embedded'
const isDockPopupOpen = useIsDockPopupOpen()

const dockModeOptions = computed(() => {
  const options = [
    { value: 'float', label: t('appearance.dockFloat'), icon: 'i-ph-cards-three-duotone' },
    { value: 'edge', label: t('appearance.dockEdge'), icon: 'i-ph-square-half-bottom-duotone' },
  ]
  if (isDockPopupSupported()) {
    options.push({ value: 'popup', label: t('appearance.dockPopup'), icon: 'i-ph-arrow-square-out-duotone' })
  }
  return options
})

const currentDockMode = computed(() => panelStore.mode)

const colorModeOptions = computed(() => [
  { value: 'auto', label: t('appearance.colorAuto'), icon: 'i-ph-laptop-duotone' },
  { value: 'light', label: t('appearance.colorLight'), icon: 'i-ph-sun-duotone' },
  { value: 'dark', label: t('appearance.colorDark'), icon: 'i-ph-moon-duotone' },
] as const)

// Language names stay in their own language so a visitor stranded in the
// wrong locale can still find theirs.
const localeOptions = Object.entries(HUB_UI_LOCALES)

function setDockMode(mode: string) {
  if (mode === 'popup') {
    requestDockPopupOpen(props.context)
  }
  else {
    panelStore.mode = mode as 'float' | 'edge'
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Language -->
    <label class="flex flex-col gap-2">
      <div class="flex flex-col">
        <span class="text-sm">{{ t('appearance.language') }}</span>
        <span class="text-xs op50">{{ t('appearance.languageHint', { productName: branding.productName }) }}</span>
      </div>
      <select
        v-model="localePreference"
        class="w-fit min-w-40 px3 py1.5 text-sm rounded-lg bg-base color-base border border-base outline-none transition-all focus-visible:ring-3 focus-visible:ring-primary-500/30"
      >
        <option value="auto">{{ t('appearance.languageAuto') }}</option>
        <option v-for="[code, name] of localeOptions" :key="code" :value="code" :lang="code">
          {{ name }}
        </option>
      </select>
    </label>

    <!-- Color mode -->
    <div class="flex flex-col gap-2">
      <div class="flex flex-col">
        <span class="text-sm">{{ t('appearance.colorMode') }}</span>
        <span class="text-xs op50">{{ t('appearance.colorModeHint', { productName: branding.productName }) }}</span>
      </div>
      <div class="flex items-center gap-1 bg-gray/10 rounded-lg p1 w-fit">
        <button
          v-for="option of colorModeOptions"
          :key="option.value"
          class="flex items-center gap-1.5 px3 py1.5 rounded-md text-sm transition-all"
          :class="colorSchemePreference === option.value
            ? 'bg-base shadow text-primary font-medium'
            : 'op60 hover:op100 hover:bg-gray/10'"
          @click="setColorSchemePreference(option.value)"
        >
          <div :class="option.icon" class="w-4 h-4" />
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- Dock mode -->
    <div v-if="isEmbedded && !isDockPopupOpen" class="flex flex-col gap-2">
      <div class="flex flex-col">
        <span class="text-sm">{{ t('appearance.dockMode') }}</span>
        <span class="text-xs op50">{{ t('appearance.dockModeHint', { productName: branding.productName }) }}</span>
      </div>
      <div class="flex items-center gap-1 bg-gray/10 rounded-lg p1 w-fit">
        <button
          v-for="option of dockModeOptions"
          :key="option.value"
          class="flex items-center gap-1.5 px3 py1.5 rounded-md text-sm transition-all"
          :class="currentDockMode === option.value
            ? 'bg-base shadow text-primary font-medium'
            : 'op60 hover:op100 hover:bg-gray/10'"
          @click="setDockMode(option.value)"
        >
          <div :class="option.icon" class="w-4 h-4" />
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- Show iframe address bar toggle -->
    <label class="flex items-center gap-3 cursor-pointer group">
      <button
        class="w-10 h-6 rounded-full transition-colors relative shrink-0"
        :class="settings.showIframeAddressBar ? 'bg-primary' : 'bg-gray/30'"
        @click="settingsStore.mutate((s) => { s.showIframeAddressBar = !settings.showIframeAddressBar })"
      >
        <div
          class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
          :class="settings.showIframeAddressBar ? 'translate-x-5' : 'translate-x-1'"
        />
      </button>
      <div class="flex flex-col">
        <span class="text-sm">{{ t('appearance.addressBar') }}</span>
        <span class="text-xs op50">{{ t('appearance.addressBarHint') }}</span>
      </div>
    </label>

    <!-- Close on outside click toggle -->
    <label class="flex items-center gap-3 cursor-pointer group">
      <button
        class="w-10 h-6 rounded-full transition-colors relative shrink-0"
        :class="settings.closeOnOutsideClick ? 'bg-primary' : 'bg-gray/30'"
        @click="settingsStore.mutate((s) => { s.closeOnOutsideClick = !settings.closeOnOutsideClick })"
      >
        <div
          class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
          :class="settings.closeOnOutsideClick ? 'translate-x-5' : 'translate-x-1'"
        />
      </button>
      <div class="flex flex-col">
        <span class="text-sm">{{ t('appearance.closeOutside') }}</span>
        <span class="text-xs op50">{{ t('appearance.closeOutsideHint', { productName: branding.productName }) }}</span>
      </div>
    </label>

    <!-- Auto-collapse edge toolbar toggle -->
    <label class="flex items-center gap-3 cursor-pointer group">
      <button
        class="w-10 h-6 rounded-full transition-colors relative shrink-0"
        :class="settings.autoCollapseEdgeToolbar ? 'bg-primary' : 'bg-gray/30'"
        @click="settingsStore.mutate((s) => { s.autoCollapseEdgeToolbar = !settings.autoCollapseEdgeToolbar })"
      >
        <div
          class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
          :class="settings.autoCollapseEdgeToolbar ? 'translate-x-5' : 'translate-x-1'"
        />
      </button>
      <div class="flex flex-col">
        <span class="text-sm">{{ t('appearance.autoCollapse') }}</span>
        <span class="text-xs op50">{{ t('appearance.autoCollapseHint') }}</span>
      </div>
    </label>
  </div>
</template>
