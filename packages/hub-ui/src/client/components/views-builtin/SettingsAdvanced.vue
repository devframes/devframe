<script setup lang="ts">
import type { DocksContext } from '@devframes/hub/client'
import { DEFAULT_STATE_USER_SETTINGS } from '@devframes/hub/constants'
import { t } from '../../i18n'
import { useBranding } from '../../state/branding'
import { useConfirm } from '../../state/confirm'
import { useSettings } from '../../state/settings-defaults'

const props = defineProps<{
  context: DocksContext
}>()

const settings = useSettings(props.context)
const settingsStore = props.context.docks.settings
const branding = useBranding()
const confirm = useConfirm()

async function resetAllSettings() {
  if (await confirm({
    title: t('advanced.resetAll'),
    message: t('advanced.resetAllConfirm'),
  })) {
    settingsStore.mutate(() => {
      return DEFAULT_STATE_USER_SETTINGS()
    })
  }
}

async function resetShortcuts() {
  if (await confirm({
    title: t('advanced.resetShortcuts'),
    message: t('advanced.resetShortcutsConfirm'),
  })) {
    settingsStore.mutate((state) => {
      state.commandShortcuts = {}
    })
  }
}

async function resetDocks() {
  if (await confirm({
    title: t('advanced.resetDocks'),
    message: t('advanced.resetDocksConfirm'),
  })) {
    settingsStore.mutate((state) => {
      const defaults = DEFAULT_STATE_USER_SETTINGS()
      state.docksHidden = defaults.docksHidden
      state.docksCategoriesHidden = defaults.docksCategoriesHidden
      state.docksCustomOrder = defaults.docksCustomOrder
      state.docksPinned = defaults.docksPinned
    })
  }
}

async function deauthorize() {
  if (await confirm({
    title: t('advanced.revoke'),
    message: t('advanced.revokeConfirm', { productName: branding.value.productName }),
  })) {
    // Revokes this session's bearer token server-side; the server then
    // broadcasts `devframe:auth:revoked`, dropping this (and any sibling)
    // client back to untrusted.
    await props.context.rpc.call('devframe:auth:revoke')
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Show Devframe Inspector toggle -->
    <label class="flex items-center gap-3 cursor-pointer group">
      <button
        class="w-10 h-6 rounded-full transition-colors relative shrink-0"
        :class="settings.showDevframeInspector ? 'bg-primary' : 'bg-gray/30'"
        @click="settingsStore.mutate((s) => { s.showDevframeInspector = !settings.showDevframeInspector })"
      >
        <div
          class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
          :class="settings.showDevframeInspector ? 'translate-x-5' : 'translate-x-1'"
        />
      </button>
      <div class="flex flex-col">
        <span class="text-sm">{{ t('advanced.inspector') }}</span>
        <span class="text-xs op50">{{ t('advanced.inspectorHint') }}</span>
      </div>
    </label>

    <div class="border-t border-base" />

    <!-- Reset Shortcuts -->
    <div class="flex items-start gap-4">
      <div class="flex-1">
        <div class="text-sm">
          {{ t('advanced.resetShortcuts') }}
        </div>
        <div class="text-xs op50 mt-0.5">
          {{ t('advanced.resetShortcutsHint') }}
        </div>
      </div>
      <button
        class="px-4 py-2 rounded bg-orange/10 text-orange hover:bg-orange/20 transition-colors flex items-center gap-2 text-sm shrink-0"
        @click="resetShortcuts"
      >
        <div class="i-ph-keyboard-duotone w-4 h-4" />
        {{ t('advanced.resetShortcutsAction') }}
      </button>
    </div>

    <!-- Reset Docks -->
    <div class="flex items-start gap-4">
      <div class="flex-1">
        <div class="text-sm">
          {{ t('advanced.resetDocks') }}
        </div>
        <div class="text-xs op50 mt-0.5">
          {{ t('advanced.resetDocksHint') }}
        </div>
      </div>
      <button
        class="px-4 py-2 rounded bg-orange/10 text-orange hover:bg-orange/20 transition-colors flex items-center gap-2 text-sm shrink-0"
        @click="resetDocks"
      >
        <div class="i-ph-layout-duotone w-4 h-4" />
        {{ t('advanced.resetDocksAction') }}
      </button>
    </div>

    <!-- Reset All -->
    <div class="border-t border-base pt-6">
      <div class="flex items-start gap-4">
        <div class="flex-1">
          <div class="text-sm">
            {{ t('advanced.resetAll') }}
          </div>
          <div class="text-xs op50 mt-0.5">
            {{ t('advanced.resetAllHint') }}
          </div>
        </div>
        <button
          class="px-4 py-2 rounded bg-red/10 text-red hover:bg-red/20 transition-colors flex items-center gap-2 text-sm shrink-0"
          @click="resetAllSettings"
        >
          <div class="i-ph-arrow-counter-clockwise w-4 h-4" />
          {{ t('advanced.resetAllAction') }}
        </button>
      </div>
    </div>

    <!-- Revoke Authorization -->
    <div class="border-t border-base pt-6">
      <div class="flex items-start gap-4">
        <div class="flex-1">
          <div class="text-sm">
            {{ t('advanced.revoke') }}
          </div>
          <div class="text-xs op50 mt-0.5">
            {{ t('advanced.revokeHint') }}
          </div>
        </div>
        <button
          class="px-4 py-2 rounded bg-red/10 text-red hover:bg-red/20 transition-colors flex items-center gap-2 text-sm shrink-0"
          @click="deauthorize"
        >
          <div class="i-ph-sign-out-duotone w-4 h-4" />
          {{ t('advanced.revokeAction') }}
        </button>
      </div>
    </div>
  </div>
</template>
