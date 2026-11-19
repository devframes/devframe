<script setup lang="ts">
import type { DevframeDockEntry, DevframeViewGroup } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import { watchDebounced } from '@vueuse/core'
import { computed, h, nextTick, ref, useTemplateRef, watch } from 'vue'
import { t } from '../../i18n'
import { applyCustomOrderPatch, deriveSidebarCapacity, docksSplitGroupsWithCapacity, getGroupMembersGrouped, resolveGroupMemberMove } from '../../state/dock-settings'
import { getCurrentDockId } from '../../state/docks'
import { dockTooltipContent, setDocksSidebarOverflowPanel, setFloatingTooltip, useDocksSidebarOverflowPanel } from '../../state/floating-tooltip'
import { useSettings } from '../../state/settings-defaults'
import { accentVarStyle } from '../../utils/accent-color'
import { openDockContextMenu } from './DockContextMenu'
import DockGroupPopover from './DockGroupPopover.vue'
import DockIcon from './DockIcon.vue'

const props = defineProps<{
  context: DocksContext
  group: DevframeViewGroup
  selectedId: string | null
}>()

const currentId = computed(() => getCurrentDockId(props.context))

// Vertical rhythm of the rail, in px. Mirrors the Uno classes on the template:
// each button is `w-8 h-8` (32) and children sit in a `gap-0.5` (2) flex column;
// the root has `py1.5` (6+6) padding; dividers are `h-px my0.5` (1 + 2*2).
const ITEM_HEIGHT = 34 // 32 button + 2 gap
const MORE_BUTTON_HEIGHT = 34 // matches a member button + gap
const DIVIDER_HEIGHT = 7 // 5 divider + 2 gap
// Root padding (12) + anchor (32) + gap (2) + anchor divider (5) + gap (2).
const RESERVED_HEIGHT = 53

const settings = useSettings(props.context)

// Expanded: a wider rail with each member's title next to its icon. Row
// heights stay the same, so the capacity math below holds in both modes.
const expanded = computed(() => settings.value.expandGroupSidebar)

// Members split by in-group sub-category so the sidebar can divide sections.
const memberGroups = computed(() => getGroupMembersGrouped(
  props.context.docks.entries,
  props.group.id,
  settings.value,
  { whenContext: props.context.when.context },
))

const sidebar = useTemplateRef<HTMLDivElement>('sidebar')

// Bind the ResizeObserver via the sidebar element's own document/window
// rather than a global one: in popup dock mode the sidebar renders inside
// the popup's own realm, and `useElementBounding`'s window-level resize
// listener only fires for the host page, so the rail wouldn't collapse or
// restore until the mouse moved back into the host page.
const frameHeight = ref(0)
watch(sidebar, (el, _prev, onCleanup) => {
  if (!el) {
    frameHeight.value = 0
    return
  }
  const ResizeObserverCtor = el.ownerDocument?.defaultView?.ResizeObserver ?? globalThis.ResizeObserver
  if (!ResizeObserverCtor)
    return
  const observer = new ResizeObserverCtor(([entry]) => {
    if (!entry)
      return
    frameHeight.value = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
  })
  observer.observe(el)
  onCleanup(() => observer.disconnect())
}, { immediate: true, flush: 'post' })

const totalItems = computed(() => memberGroups.value.reduce((acc, [, items]) => acc + items.length, 0))

// How many members the current frame height can hold before folding the rest
// into the show-more popover.
const capacity = computed(() => deriveSidebarCapacity({
  availableHeight: frameHeight.value,
  reservedHeight: RESERVED_HEIGHT,
  itemHeight: ITEM_HEIGHT,
  dividerHeight: DIVIDER_HEIGHT,
  moreButtonHeight: MORE_BUTTON_HEIGHT,
  dividerCount: Math.max(0, memberGroups.value.filter(([, items]) => items.length).length - 1),
  totalItems: totalItems.value,
}))

const split = computed(() => docksSplitGroupsWithCapacity(memberGroups.value, capacity.value))
const visibleGroups = computed(() => split.value.visible)
const overflowGroups = computed(() => split.value.overflow)

const overflowCount = computed(() => overflowGroups.value.reduce((acc, [, items]) => acc + items.length, 0))
const hasOverflow = computed(() => overflowCount.value > 0)
const overflowBadge = computed(() => (overflowCount.value > 9
  ? '9+'
  : overflowCount.value.toString()))

// The shown member is hidden inside the show-more popover.
const currentInOverflow = computed(() =>
  !!currentId.value && overflowGroups.value.some(([, items]) => items.some(m => m.id === currentId.value)))

// The current selection is hidden inside the show-more popover.
const selectedInOverflow = computed(() =>
  !!props.selectedId && overflowGroups.value.some(([, items]) => items.some(m => m.id === props.selectedId)))

// Set when a drag ends, so the click that follows it does not open the member.
let suppressClick = false

function select(id: string) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  props.context.docks.switchEntry(id)
}

// --- Reorder ---
// Drag a member up or down within its sub-category, or press Alt+ArrowUp /
// Alt+ArrowDown on it. The order is saved to `docksCustomOrder`, the same
// setting the Docks settings page edits. Pointer capture keeps the drag alive
// while the pointer crosses the panel's iframe.
const DRAG_THRESHOLD = 4
const draggingId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)
let dragStart: { id: string, y: number } | null = null

function moveMember(fromId: string, toId: string): boolean {
  const patch = resolveGroupMemberMove(props.context.docks.entries, props.group.id, settings.value, fromId, toId)
  if (!patch)
    return false
  props.context.docks.settings.mutate(state => applyCustomOrderPatch(state, patch))
  return true
}

function findSubcategory(id: string) {
  return visibleGroups.value.find(([, items]) => items.some(m => m.id === id))
}

// Where the drop line shows on the hovered member: the dragged member takes
// the hovered member's slot, so it lands before it when moving up and after
// it when moving down.
const dropSide = computed<'before' | 'after' | null>(() => {
  if (!draggingId.value || !dragOverId.value)
    return null
  const items = findSubcategory(draggingId.value)?.[1] ?? []
  const from = items.findIndex(m => m.id === draggingId.value)
  const to = items.findIndex(m => m.id === dragOverId.value)
  return from > to
    ? 'before'
    : 'after'
})

function onMemberPointerDown(event: PointerEvent, id: string) {
  hideTooltip()
  suppressClick = false
  if (event.button !== 0)
    return
  dragStart = { id, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onMemberPointerMove(event: PointerEvent) {
  if (!dragStart)
    return
  if (!draggingId.value) {
    if (Math.abs(event.clientY - dragStart.y) < DRAG_THRESHOLD)
      return
    draggingId.value = dragStart.id
  }
  const peers = findSubcategory(dragStart.id)?.[1] ?? []
  const target = peers.find((m) => {
    const rect = sidebar.value?.querySelector(`[data-dock-id="${CSS.escape(m.id)}"]`)?.getBoundingClientRect()
    return rect && event.clientY >= rect.top && event.clientY <= rect.bottom
  })
  dragOverId.value = target && target.id !== dragStart.id
    ? target.id
    : null
}

function onMemberPointerUp() {
  if (draggingId.value) {
    // A drag is not a click, even when it ends on the start button.
    suppressClick = true
    if (dragOverId.value)
      moveMember(draggingId.value, dragOverId.value)
  }
  resetDrag()
}

function resetDrag() {
  dragStart = null
  draggingId.value = null
  dragOverId.value = null
}

async function onMemberKeydown(event: KeyboardEvent, id: string) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown'))
    return
  event.preventDefault()
  const items = findSubcategory(id)?.[1] ?? []
  const index = items.findIndex(m => m.id === id)
  const neighbor = items[index + (event.key === 'ArrowUp'
    ? -1
    : 1)]
  if (!neighbor || !moveMember(id, neighbor.id))
    return
  // Moving the focused button in the DOM can drop focus, so put it back.
  await nextTick()
  sidebar.value?.querySelector<HTMLElement>(`[data-dock-id="${CSS.escape(id)}"]`)?.focus()
}

function showTooltip(event: PointerEvent, entry: { title: string, description?: string }) {
  setFloatingTooltip({
    content: dockTooltipContent(entry),
    el: event.currentTarget as HTMLElement,
  })
}

function hideTooltip() {
  setFloatingTooltip(null)
}

// --- Show more (overflow) flyout ---
const moreButton = useTemplateRef<HTMLButtonElement>('moreButton')
const isOverflowPanelVisible = ref(false)
const overflowPanel = useDocksSidebarOverflowPanel()

function showOverflowPanel() {
  if (!moreButton.value)
    return
  isOverflowPanelVisible.value = true
  setDocksSidebarOverflowPanel({
    el: moreButton.value,
    placement: 'right',
    content: () => h(DockGroupPopover, {
      context: props.context,
      group: props.group,
      // Only the members that didn't fit on the rail.
      members: overflowGroups.value,
      selectedId: props.selectedId,
      onSelect: (entry: DevframeDockEntry) => {
        select(entry.id)
        hideOverflowPanel()
      },
    }),
  })
}

function hideOverflowPanel() {
  isOverflowPanelVisible.value = false
  setDocksSidebarOverflowPanel(null)
}

function toggleOverflowPanel() {
  if (isOverflowPanelVisible.value)
    hideOverflowPanel()
  else
    showOverflowPanel()
}

// Sync internal visibility from the store on a delay so it doesn't race the
// "click outside" dismissal (same pattern as DockOverflowButton).
watchDebounced(
  () => overflowPanel.value,
  (value) => {
    isOverflowPanelVisible.value = value?.el === moreButton.value
  },
  { debounce: 1000 },
)

function openContextMenu(e: MouseEvent, member: DevframeDockEntry) {
  e.preventDefault()
  hideTooltip()
  openDockContextMenu({
    context: props.context,
    entry: member,
    el: e.currentTarget as HTMLElement,
  })
}

// Highlight the button when the hidden selection lives here, or while open.
const moreButtonActive = computed(() => selectedInOverflow.value || isOverflowPanelVisible.value)
</script>

<template>
  <!-- The group's accentColor overrides --devframe-primary for the whole rail,
       so the anchor + selected members' text-primary/bg-active render accent. -->
  <div
    ref="sidebar"
    class="devframes-group-sidebar flex flex-col flex-none h-full border-r border-base of-y-hidden of-x-hidden select-none py1.5 gap-0.5"
    :class="[
      expanded ? 'w-44 px1.5 items-stretch' : 'w-12 items-center',
      group.accentColor ? 'devframes-accent-scope' : '',
    ]"
    :style="accentVarStyle(group.accentColor)"
  >
    <!-- Group anchor -->
    <div
      class="flex items-center h-8 op60"
      :class="[
        expanded ? 'gap-2 px1.5' : 'justify-center w-8',
        group.accentColor ? 'color-active' : '',
      ]"
      @pointerenter="showTooltip($event, group)"
      @pointerleave="hideTooltip"
    >
      <DockIcon :icon="group.icon" class="w-5 h-5 flex-none" />
      <span v-if="expanded" class="text-sm font-medium truncate">{{ group.title }}</span>
    </div>
    <div class="h-px border-t border-base my0.5" :class="expanded ? 'w-full' : 'w-8'" />

    <!-- Member icons, grouped by in-group sub-category -->
    <template v-for="([category, members], idx) of visibleGroups" :key="category">
      <!-- Sub-category divider, mirroring the group anchor separator -->
      <div v-if="idx > 0 && members.length" class="h-px border-t border-base my0.5" :class="expanded ? 'w-full' : 'w-8'" />
      <button
        v-for="member of members"
        :key="member.id"
        :data-dock-id="member.id"
        :aria-label="member.title"
        :aria-current="currentId === member.id ? 'page' : undefined"
        class="relative flex items-center h-8 rounded-lg transition"
        :class="[
          expanded ? 'gap-2 px1.5' : 'justify-center w-8',
          selectedId === member.id ? 'text-primary bg-active' : 'op60 hover:op100 hover:bg-active',
          draggingId === member.id ? 'op30!' : '',
        ]"
        @pointerenter="draggingId || showTooltip($event, member)"
        @pointerleave="hideTooltip"
        @pointerdown="onMemberPointerDown($event, member.id)"
        @pointermove="onMemberPointerMove"
        @pointerup="onMemberPointerUp"
        @pointercancel="resetDrag"
        @click="select(member.id)"
        @keydown="onMemberKeydown($event, member.id)"
        @contextmenu="openContextMenu($event, member)"
      >
        <!-- Drop line: where the dragged member will land -->
        <div
          v-if="dragOverId === member.id"
          class="absolute inset-x-1 h-0.5 rounded-full bg-primary pointer-events-none"
          :class="dropSide === 'before' ? '-top-0.5' : '-bottom-0.5'"
        />
        <DockIcon :icon="member.icon" class="w-5 h-5 flex-none" />
        <span v-if="expanded" class="flex-1 min-w-0 text-left text-sm truncate">{{ member.title }}</span>
        <div
          v-if="member.badge"
          class="bg-gray-6 text-white text-0.6em px-0.5 rounded-full shadow leading-none"
          :class="expanded ? 'flex-none' : 'absolute top-0.5 right-0.5'"
        >
          {{ member.badge }}
        </div>
      </button>
    </template>

    <!-- Show more: members that don't fit the current frame height -->
    <button
      v-if="hasOverflow"
      ref="moreButton"
      :aria-label="t('dock.showMore')"
      :aria-current="currentInOverflow ? 'true' : undefined"
      class="relative flex items-center h-8 rounded-lg transition mt-auto flex-none"
      :class="[
        expanded ? 'gap-2 px1.5' : 'justify-center w-8',
        moreButtonActive ? 'text-primary bg-active' : 'op60 hover:op100 hover:bg-active',
      ]"
      @pointerenter="showTooltip($event, t('dock.showMore'))"
      @pointerleave="hideTooltip"
      @pointerdown="hideTooltip"
      @click="toggleOverflowPanel"
    >
      <DockIcon icon="ph:dots-three-circle-duotone" class="w-5 h-5 flex-none" />
      <span v-if="expanded" class="flex-1 min-w-0 text-left text-sm truncate">{{ t('dock.showMore') }}</span>
      <div
        class="bg-gray-6 text-white text-0.6em px-0.5 rounded-full shadow leading-none"
        :class="expanded ? 'flex-none' : 'absolute top-0.5 right-0.5'"
      >
        {{ overflowBadge }}
      </div>
    </button>
  </div>
</template>
