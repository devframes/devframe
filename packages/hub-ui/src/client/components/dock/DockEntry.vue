<script setup lang="ts">
import type { DevframeDockBadgeVariant, DevframeDockEntryBase } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import { useEventListener } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { setFloatingTooltip } from '../../state/floating-tooltip'
import { openDockContextMenu } from './DockContextMenu'
import DockIcon from './DockIcon.vue'

const props = withDefaults(
  defineProps<{
    context: DocksContext
    dock: DevframeDockEntryBase
    isAction?: boolean
    isSelected?: boolean
    isDimmed?: boolean
    isVertical?: boolean
    badge?: string
    badgeVariant?: DevframeDockBadgeVariant
    tooltip?: boolean
  }>(),
  {
    tooltip: true,
  },
)

// Mirrors json-render's `Badge` variant→color-name map (see
// `@devframes/json-render-ui`'s `Badge.ts`), applied as an inline fill since
// the dock bar doesn't pull in json-render-ui's `DisplayBadge` component.
// `undefined` at `'default'`/unset keeps the existing `bg-primary text-white`
// classes below — every existing badge consumer keeps its current look.
const badgeColors: Record<Exclude<DevframeDockBadgeVariant, 'default'>, { bg: string, fg: string }> = {
  info: { bg: '#3b82f6', fg: '#eff6ff' },
  success: { bg: '#22c55e', fg: '#f0fdf4' },
  warning: { bg: '#f59e0b', fg: '#fffbeb' },
  danger: { bg: '#ef4444', fg: '#fef2f2' },
}

const badgeStyle = computed(() => {
  if (!props.badgeVariant || props.badgeVariant === 'default')
    return undefined
  const { bg, fg } = badgeColors[props.badgeVariant]
  return { backgroundColor: bg, color: fg }
})

const button = useTemplateRef<HTMLButtonElement>('button')

function updateTooltip() {
  if (!props.tooltip)
    return
  if (!button.value)
    return
  setFloatingTooltip({
    content: props.dock.title,
    el: button.value,
  })
}

function clearTitle() {
  if (!props.tooltip)
    return
  setFloatingTooltip(null)
}

function openContextMenu(e: MouseEvent) {
  if (!button.value)
    return
  if (props.dock.id === 'overflow')
    return
  e.preventDefault()
  clearTitle()
  const entry = props.context.docks.entries.find(item => item.id === props.dock.id)
  if (!entry)
    return
  openDockContextMenu({
    context: props.context,
    entry,
    el: button.value,
    gap: 6,
  })
}

useEventListener('pointerdown', () => {
  if (!props.tooltip)
    return
  setFloatingTooltip(null)
})
</script>

<template>
  <div
    :key="dock.id"
    class="relative group devframes-dock-entry"
    @pointerenter="updateTooltip"
    @pointerleave="clearTitle"
    @contextmenu="openContextMenu"
  >
    <button
      ref="button"
      :aria-label="dock.title"
      :class="[
        isVertical ? 'rotate-270' : '',
        isDimmed ? 'op50 saturate-0' : '',
        isSelected ? 'scale-120 text-primary' : '',
        isAction ? 'bg-[#8881] hover:bg-[#8882] rounded-full' : 'rounded-xl',
      ]"
      class="flex items-center justify-center p1.5 hover:bg-[#8881] hover:scale-110 transition-all duration-300 relative outline-none"
    >
      <DockIcon :icon="dock.icon" class="w-5 h-5 select-none" />
      <div
        v-if="badge"
        class="absolute top-0.5 right-0 text-0.6em px-1 rounded-full shadow"
        :class="badgeStyle ? '' : 'bg-primary text-white'"
        :style="badgeStyle"
      >
        {{ badge }}
      </div>
    </button>
  </div>
</template>
