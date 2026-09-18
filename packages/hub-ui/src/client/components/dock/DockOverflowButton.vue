<script setup lang="ts">
import type { DevframeDockEntry } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { DevframeDockEntriesGrouped } from '../../state/dock-settings'
import type { FloatingPopoverProps } from '../../state/floating-tooltip'
import { watchDebounced } from '@vueuse/core'
import { computed, h, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { setDocksOverflowPanel, useDocksOverflowPanel } from '../../state/floating-tooltip'
import DockEntriesWithCategories from './DockEntriesWithCategories.vue'
import DockEntry from './DockEntry.vue'

const props = defineProps<{
  context: DocksContext
  isVertical: boolean
  groups: DevframeDockEntriesGrouped
  selected: DevframeDockEntry | null
  placement?: FloatingPopoverProps['placement']
}>()

const emit = defineEmits<{
  (e: 'select', entry: DevframeDockEntry): void
  (e: 'activity'): void
}>()

const overflowButton = useTemplateRef<HTMLButtonElement>('overflowButton')
const overflowBadge = computed(() => {
  const count = props.groups.reduce((acc, [_, items]) => acc + items.length, 0)
  if (count > 9)
    return '9+'
  return count.toString()
})

const isOverflowPanelVisible = ref(false)
const docksOverflowPanel = useDocksOverflowPanel()

function showOverflowPanel() {
  if (!overflowButton.value)
    return
  isOverflowPanelVisible.value = true
  setDocksOverflowPanel({
    content: () => h('div', {
      class: 'flex gap-0 flex-wrap max-w-220px',
      // Edge menus also need room for the toolbar, popover padding and gap.
      // Float mode keeps its existing sizing when no placement is supplied.
      style: props.placement
        ? {
            maxWidth: `min(220px, calc(100vw - ${props.placement === 'left' || props.placement === 'right' ? 80 : 36}px))`,
            maxHeight: `calc(100vh - ${props.placement === 'top' || props.placement === 'bottom' ? 80 : 36}px)`,
            overflow: 'auto',
          }
        : undefined,
      onMousemove: () => emit('activity'),
    }, [
      h(DockEntriesWithCategories, {
        context: props.context,
        groups: props.groups,
        isVertical: false,
        selected: props.selected,
        onSelect: (e) => {
          emit('select', e)
          hideOverflowPanel()
        },
      }),
    ]),
    el: overflowButton.value,
    placement: props.placement,
  })
}

// We have an internal state and delay the update to the DOM to conflicts with the "onClickOutside" logic
watchDebounced(
  () => docksOverflowPanel.value,
  (value) => {
    isOverflowPanelVisible.value = !!value
  },
  { debounce: 1000 },
)

function toggleOverflowPanel() {
  if (isOverflowPanelVisible.value)
    hideOverflowPanel()
  else
    showOverflowPanel()
}

function hideOverflowPanel() {
  isOverflowPanelVisible.value = false
  setDocksOverflowPanel(null)
}

onBeforeUnmount(() => {
  if (docksOverflowPanel.value?.el === overflowButton.value)
    hideOverflowPanel()
})
</script>

<template>
  <div ref="overflowButton">
    <DockEntry
      :context="context"
      :dock="{
        id: 'overflow',
        title: 'Overflow',
        icon: 'ph:dots-three-circle-duotone',
      }"
      class="overflow-button"
      :tooltip="false"
      :badge="overflowBadge"
      :is-vertical="isVertical"
      :is-selected="false"
      :is-dimmed="false"
      @click="toggleOverflowPanel"
    />
  </div>
</template>
