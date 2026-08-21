<script setup lang="ts">
import type { DevframeDockEntry } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { isDark } from '../../state/color-mode'

// Renders any dock type hub-ui has no native view for through the hub's
// dock-renderer registry — a renderer registered locally, or a prebuilt
// module served by the hub's renderer manifest (`initHub({ renderers })`),
// e.g. `@devframes/json-render-ui` for `'json-render'` docks. With no
// renderer available for the type it shows the missing-renderer fallback; a
// module that fails to load gets the error variant with a retry.

const props = defineProps<{
  context: DocksContext
  entry: DevframeDockEntry
}>()

type ViewState = 'loading' | 'mounted' | 'missing-renderer' | 'load-error'

const container = useTemplateRef<HTMLDivElement>('container')
const state = ref<ViewState>('loading')
const errorMessage = ref<string | null>(null)
let dispose: (() => void) | undefined
let mountToken = 0

async function mount(): Promise<void> {
  const token = ++mountToken
  dispose?.()
  dispose = undefined

  // Availability is checked up front so a type nobody covers renders the
  // fallback without a mount attempt (and without the registry's warn noise
  // repeating on every remount).
  if (!props.context.renderers.has(props.entry.type)) {
    state.value = 'missing-renderer'
    return
  }
  state.value = 'loading'
  errorMessage.value = null
  const result = await props.context.renderers.mount(props.entry, container.value!)
  if (token !== mountToken) {
    // A newer mount superseded this one — drop it.
    if (result.status === 'mounted')
      result.dispose()
    return
  }
  if (result.status === 'mounted') {
    dispose = result.dispose
    state.value = 'mounted'
  }
  else if (result.status === 'missing-renderer') {
    state.value = 'missing-renderer'
  }
  else {
    state.value = 'load-error'
    errorMessage.value = String((result.error as Error | undefined)?.message ?? result.error)
  }
}

onMounted(() => {
  void mount()
})
watch(() => props.entry.id, () => {
  void mount()
})
onUnmounted(() => {
  mountToken++
  dispose?.()
  dispose = undefined
})
</script>

<template>
  <div class="devframes-view-dock-renderer relative h-full w-full">
    <!--
      The renderer's mount container. Kept in the tree across every state so
      a retry can remount in place. Carries the live `dark` class — the theme
      contract a self-styling renderer resolves its dark-mode rules against.
    -->
    <div
      v-show="state === 'mounted' || state === 'loading'"
      ref="container"
      class="h-full w-full"
      :class="isDark ? 'dark' : 'light'"
    />

    <div
      v-if="state === 'missing-renderer'"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 p6 text-center"
    >
      <div class="i-ph:puzzle-piece-duotone text-3xl color-faint" />
      <div class="text-sm color-muted">
        No renderer for “{{ entry.type }}” in the current environment
      </div>
      <div class="text-xs color-faint">
        The host has not registered a renderer for this dock type.
      </div>
    </div>

    <div
      v-else-if="state === 'load-error'"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 p6 text-center"
    >
      <div class="i-ph:warning-duotone text-3xl color-faint" />
      <div class="text-sm color-muted">
        The renderer for “{{ entry.type }}” failed to load
      </div>
      <div v-if="errorMessage" class="max-w-100 text-xs color-faint">
        {{ errorMessage }}
      </div>
      <ActionButton class="mt-2" @click="mount()">
        Retry
      </ActionButton>
    </div>
  </div>
</template>
