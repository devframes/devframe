<script setup lang="ts">
import type { DevframeDockEntry, DevframeViewGroup } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import { watchDebounced } from '@vueuse/core'
import { computed, h, ref, useTemplateRef } from 'vue'
import { getGroupMembers, getGroupMembersGrouped, resolveGroupPreferredChild } from '../../state/dock-settings'
import { setDocksGroupPanel, useDocksGroupPanel } from '../../state/floating-tooltip'
import { useSettings } from '../../state/settings-defaults'
import { accentVarStyle } from '../../utils/accent-color'
import DockEntry from './DockEntry.vue'
import DockGroupPopover from './DockGroupPopover.vue'

const props = withDefaults(defineProps<{
  context: DocksContext
  group: DevframeViewGroup
  isVertical: boolean
  selected: DevframeDockEntry | null
  dimInactive?: boolean
}>(), {
  dimInactive: true,
})

const emit = defineEmits<{
  (e: 'select', entry: DevframeDockEntry): void
}>()

const settings = useSettings(props.context)

const members = computed(() => getGroupMembers(
  props.context.docks.entries,
  props.group.id,
  settings.value,
  { whenContext: props.context.when.context },
))

// Same members, split by in-group sub-category, for the popover's sectioned view.
const membersGrouped = computed(() => getGroupMembersGrouped(
  props.context.docks.entries,
  props.group.id,
  settings.value,
  { whenContext: props.context.when.context },
))

// The group button is "active" while any of its members owns the panel.
const isActive = computed(() => {
  const id = props.selected?.id
  return !!id && members.value.some(m => m.id === id)
})

const groupButton = useTemplateRef<HTMLElement>('groupButton')
const isPanelVisible = ref(false)
const docksGroupPanel = useDocksGroupPanel()

function showPanel() {
  if (!groupButton.value)
    return
  isPanelVisible.value = true
  setDocksGroupPanel({
    el: groupButton.value,
    content: () => h(DockGroupPopover, {
      context: props.context,
      group: props.group,
      members: membersGrouped.value,
      selectedId: props.selected?.id ?? null,
      onSelect: (entry: DevframeDockEntry) => {
        emit('select', entry)
        hidePanel()
      },
    }),
  })
}

function hidePanel() {
  isPanelVisible.value = false
  setDocksGroupPanel(null)
}

function togglePanel() {
  if (isPanelVisible.value)
    hidePanel()
  else
    showPanel()
}

// Delay syncing internal visibility from the store so it doesn't race the
// "click outside" dismissal (same pattern as the overflow button). Compare by
// element because `docksGroupPanel` is a single shared ref across every group
// button, so a sibling group's popover must not light up this one.
watchDebounced(
  () => docksGroupPanel.value,
  (value) => {
    isPanelVisible.value = value?.el === groupButton.value
  },
  { debounce: 1000 },
)

function onClick() {
  // An active group closes the panel entirely.
  if (isActive.value) {
    hidePanel()
    emit('select', undefined!)
    return
  }
  // The member last opened in this group this tab, then the author's
  // `defaultChildId`, opens directly; otherwise reveal the popover. Resolved
  // regardless of the target's render-only `visibility` (a hidden button must
  // still fire), but honoring its `when` clause.
  const fallback = resolveGroupPreferredChild(
    props.context.docks.entries,
    props.group,
    props.context.panel.session.groupLastChildIds?.[props.group.id],
    props.context.when.context,
  )
  if (fallback) {
    hidePanel()
    emit('select', fallback)
    return
  }
  togglePanel()
}
</script>

<template>
  <div ref="groupButton" :class="group.accentColor ? 'devframes-accent-scope' : ''" :style="accentVarStyle(group.accentColor)">
    <DockEntry
      :context="context"
      :dock="group"
      :is-vertical="isVertical"
      :is-selected="isActive || isPanelVisible"
      :is-dimmed="dimInactive && selected ? !isActive : false"
      :badge="group.badge"
      :badge-variant="group.badgeVariant"
      @click="onClick"
    />
  </div>
</template>
