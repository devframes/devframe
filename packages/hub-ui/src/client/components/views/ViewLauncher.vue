<script setup lang="ts">
import type { DevframeViewLauncherStatus } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { HubViewLauncher } from '../../types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { HUB_EVENTS } from '@devframes/hub/constants'
import { computed, ref, watch } from 'vue'
import { TERMINALS_DOCK_ID } from '../../constants'
import DockIcon from '../dock/DockIcon.vue'

const props = defineProps<{
  context: DocksContext
  entry: HubViewLauncher
}>()

// Selectable launch roots the owner attached to the entry. When present a
// picker is shown and the chosen root travels with the launch as `{ root }`.
const roots = computed(() => props.entry.launcher.roots)
const selectedRoot = ref<string | undefined>(roots.value?.[0]?.value)

// Keep the selection valid as roots change: default to the first root, and
// reset if the current pick disappears from the list.
watch(roots, (next) => {
  const first = next?.[0]
  if (!first) {
    selectedRoot.value = undefined
    return
  }
  if (!next!.some(root => root.value === selectedRoot.value))
    selectedRoot.value = first.value
}, { immediate: true })

function onLaunch() {
  // The hub's serializable launch path: the launcher binds a command id, and
  // the viewer dispatches it (`hub:commands:execute` for server commands).
  // Status/error/digest updates flow back through the owner patching the dock
  // entry via `docks.update()`.
  const command = props.entry.launcher.command
  if (!command)
    return
  void props.context.commands.execute(
    command,
    roots.value?.length ? { root: selectedRoot.value } : undefined,
  )
}

const status = computed(() => props.entry.launcher.status || 'idle')
// Hub's author-set `digest` — a short line of progress/status.
const progress = computed(() => props.entry.launcher.digest)
const terminalSessionId = computed(() => props.entry.launcher.terminalSessionId)

// Ask the host shell to switch to the Terminals dock focused on this
// launcher's session (devframe 0.7.3 `hub:docks:activate`). Our shell converges
// on the mirrored `devframe:docks:active` slot to perform the switch.
function viewInTerminal() {
  if (!terminalSessionId.value)
    return
  props.context.rpc.call(HUB_EVENTS.rpc.docksActivate, {
    dockId: TERMINALS_DOCK_ID,
    params: { sessionId: terminalSessionId.value },
  })
}

const iconsMap: Record<DevframeViewLauncherStatus, string> = {
  error: 'i-ph-arrow-clockwise-duotone',
  idle: 'i-ph-rocket-launch-duotone',
  loading: 'i-ph-spinner-gap-duotone animate-spin',
  success: 'i-ph:check',
}

const error = computed(() => props.entry.launcher.error)

const buttonText = computed(() => {
  if (status.value === 'idle')
    return props.entry.launcher.buttonStart || 'Launch'
  else if (status.value === 'loading')
    return props.entry.launcher.buttonLoading || 'Loading...'
  else if (status.value === 'error')
    return 'Retry'
  else if (status.value === 'success')
    return 'Success'
  else
    return `UNKNOWN STATUS: ${status.value}`
})

// Idle and error are actionable (error = Retry); loading and success are not.
const canLaunch = computed(() => status.value === 'idle' || status.value === 'error')
</script>

<template>
  <div class="flex flex-col gap-4 items-center justify-center h-full relative">
    <DockIcon :icon="entry.launcher.icon || entry.icon" class="w-10 h-10" />
    <h1 class="text-2xl font-bold">
      {{ entry.launcher.title }}
    </h1>
    <p>{{ entry.launcher.description }}</p>

    <label v-if="roots?.length" class="flex flex-col gap-1 max-w-full w-64 items-start">
      <span class="text-xs op60">Launch root</span>
      <select
        v-model="selectedRoot"
        :disabled="status === 'loading'"
        :title="roots.find(root => root.value === selectedRoot)?.description"
        class="w-full px3 py2 text-sm rounded-lg bg-base color-base border border-base outline-none transition-all focus-visible:ring-3 focus-visible:ring-primary-500/30 disabled:op50 disabled:pointer-events-none"
      >
        <option v-for="root in roots" :key="root.value" :value="root.value">
          {{ root.label }}
        </option>
      </select>
    </label>

    <ActionButton
      variant="primary"
      class="min-w-40 justify-center"
      :class="status === 'error' ? 'bg-error! border-error!' : ''"
      :icon="iconsMap[status]"
      :loading="status === 'loading'"
      :disabled="!canLaunch"
      @click="onLaunch"
    >
      {{ buttonText }}
    </ActionButton>

    <!-- Fixed-height action zone: reserves space so the card doesn't shift as
         the status line / navigation toggle across idle → loading → done. -->
    <div class="min-h-16 max-w-full flex flex-col gap-2 items-center">
      <!-- Failure reason, or a short line of progress/status (never both). -->
      <p v-if="status === 'error' && error" class="max-w-full text-sm text-red-600 dark:text-red-400 text-center text-balance">
        {{ error }}
      </p>
      <div v-else-if="progress" class="inline-flex items-center gap-2 text-sm color-base op70">
        <div v-if="status === 'loading'" class="i-ph-dots-three-outline-duotone animate-pulse flex-none" />
        <span class="truncate">{{ progress }}</span>
      </div>

      <ActionButton
        v-if="terminalSessionId"
        variant="text"
        size="sm"
        icon="i-ph-arrow-square-out-duotone"
        @click="viewInTerminal"
      >
        View in Terminal
      </ActionButton>
    </div>
  </div>
</template>
