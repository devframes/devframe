import type { DevframeDockEntry, DevframeDockEntryIcon } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'
import { locale, t } from '../../i18n'
import { resolveDockContextMenu } from '../../state/dock-context-menu'
import { setDockContextMenu } from '../../state/floating-tooltip'
import { isDockPopupSupported, requestDockPopupOpen, useIsDockPopupOpen } from '../../state/popup'
import DockIcon from './DockIcon.vue'

// @unocss-include

interface DockMenuButton {
  type?: 'button'
  label: string
  /** A UnoCSS icon class for a built-in item, an Iconify name for an item from `contextMenu`. */
  icon?: string | { type: 'iconify', icon: DevframeDockEntryIcon }
  checked?: boolean
  action: () => void
}

type DockMenuItem = DockMenuButton | { type: 'separator' }

const MENU_ITEM_SELECTOR = '[role="menuitem"],[role="menuitemcheckbox"]'

function renderIcon(icon: DockMenuButton['icon']) {
  const box = 'size-4.5 flex-none flex items-center justify-center text-base op60'
  if (!icon)
    return h('div', { class: box })
  if (typeof icon === 'string') {
    return h('div', { class: box }, [
      h('div', { class: icon }),
    ])
  }
  return h(DockIcon, { icon: icon.icon, class: box })
}

function renderMenuItem(item: DockMenuItem) {
  if (item.type === 'separator')
    return h('div', { role: 'separator', class: 'my1 border-t border-base' })
  const isCheckbox = item.checked !== undefined
  return h('button', {
    'role': isCheckbox ? 'menuitemcheckbox' : 'menuitem',
    'aria-checked': isCheckbox
      ? String(item.checked)
      : undefined,
    'class': 'flex items-center gap-2 px3 py1.5 rounded hover:bg-active focus-visible:bg-active outline-none transition text-left',
    'onClick': item.action,
  }, [
    renderIcon(item.icon),
    h('span', { class: 'flex-auto' }, item.label),
    isCheckbox && item.checked
      ? h('div', { 'class': 'i-ph-check text-base op60', 'aria-hidden': 'true' })
      : null,
  ])
}

/**
 * The menu body. Takes focus on open so a keyboard user (Shift+F10 or the
 * Menu key fire `contextmenu` on the focused dock button) can pick an item
 * right away: arrows and Home/End move between items, Escape closes the menu
 * and hands focus back to the trigger, Tab closes it.
 */
const DockContextMenuList = defineComponent({
  name: 'DockContextMenuList',
  props: {
    items: { type: Array as () => DockMenuItem[], required: true },
    trigger: { type: Object as () => HTMLElement, required: true },
  },
  setup(props) {
    const root = ref<HTMLElement>()
    const buttons = () => Array.from(root.value?.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR) ?? [])

    onMounted(() => nextTick(() => buttons()[0]?.focus({ preventScroll: true })))

    function onKeydown(e: KeyboardEvent) {
      const list = buttons()
      const index = list.indexOf(e.target as HTMLButtonElement)
      const move = (to: number) => {
        e.preventDefault()
        list[(to + list.length) % list.length]?.focus()
      }
      switch (e.key) {
        case 'ArrowDown': return move(index + 1)
        case 'ArrowUp': return move(index - 1)
        case 'Home': return move(0)
        case 'End': return move(list.length - 1)
        case 'Escape':
          e.preventDefault()
          setDockContextMenu(null)
          props.trigger.focus({ preventScroll: true })
          return
        case 'Tab':
          setDockContextMenu(null)
      }
    }

    return () => h('div', {
      ref: root,
      role: 'menu',
      class: 'devframes-dock-menu flex flex-col text-sm min-w-36 mx--1',
      onKeydown,
    }, props.items.map(renderMenuItem))
  },
})

function hideDock(context: DocksContext, entry: DevframeDockEntry) {
  const settingsStore = context.docks.settings
  const id = entry.id
  settingsStore.mutate((state) => {
    if (!state.docksHidden.includes(id))
      state.docksHidden = [...state.docksHidden, id]
  })
  if (context.docks.selected?.id === id)
    context.docks.switchEntry(null)
  setDockContextMenu(null)
}

function refreshDock(context: DocksContext, entry: DevframeDockEntry) {
  const state = context.docks.getStateById(entry.id)
  const iframe = state?.domElements.iframe
  if (!iframe) {
    setDockContextMenu(null)
    return
  }
  const src = iframe.src
  iframe.src = ''
  iframe.src = src
  setDockContextMenu(null)
}

function togglePinDock(context: DocksContext, entry: DevframeDockEntry) {
  const id = entry.id
  context.docks.settings.mutate((state) => {
    state.docksPinned = state.docksPinned.includes(id)
      ? state.docksPinned.filter(item => item !== id)
      : [...state.docksPinned, id]
  })
  setDockContextMenu(null)
}

function canPin(context: DocksContext, entry: DevframeDockEntry) {
  if (entry.id.startsWith('~'))
    return false
  return context.docks.entries.some(item => item.id === entry.id)
}

function canHide(context: DocksContext, entry: DevframeDockEntry) {
  if (entry.id === '~settings')
    return false
  return context.docks.entries.some(item => item.id === entry.id)
}

function canRefresh(entry: DevframeDockEntry) {
  return entry.type === 'iframe'
}

/** Items from the entry's `contextMenu`. */
function getEntryMenuItems(context: DocksContext, entry: DevframeDockEntry): DockMenuItem[] {
  const resolved = resolveDockContextMenu(entry.contextMenu, context.commands.commands, context.when.context, locale.value)
  return resolved.map((item): DockMenuItem => item.type === 'separator'
    ? item
    : {
        label: item.title,
        icon: item.icon
          ? { type: 'iconify', icon: item.icon }
          : undefined,
        checked: item.checked,
        action: () => {
          setDockContextMenu(null)
          context.commands.execute(item.command, ...item.args).catch(console.error)
        },
      })
}

export function openDockContextMenu(options: {
  context: DocksContext
  entry: DevframeDockEntry
  el: HTMLElement
  gap?: number
}) {
  const { context, entry, el, gap = 6 } = options
  const isEdgeMode = context.panel.store.mode === 'edge'
  const isPinned = context.docks.settings.value().docksPinned.includes(entry.id)
  const builtinItems = [
    {
      label: isPinned
        ? t('docks.unpin')
        : t('docks.pin'),
      icon: isPinned ? 'i-ph-push-pin-slash-duotone' : 'i-ph-push-pin-duotone',
      action: () => togglePinDock(context, entry),
      visible: canPin(context, entry),
    },
    {
      label: t('common.hide'),
      icon: 'i-ph-eye-slash-duotone',
      action: () => hideDock(context, entry),
      visible: canHide(context, entry),
    },
    {
      label: t('common.refresh'),
      icon: 'i-ph-arrow-clockwise-duotone',
      action: () => refreshDock(context, entry),
      visible: canRefresh(entry),
    },
    {
      label: isEdgeMode
        ? t('command.floatMode')
        : t('command.edgeMode'),
      icon: isEdgeMode ? 'i-ph-arrows-out-duotone' : 'i-ph-square-half-bottom-duotone',
      action: () => {
        if (isEdgeMode) {
          // Reset float position defaults based on current edge position
          const store = context.panel.store
          switch (store.position) {
            case 'bottom':
              store.left = 50
              store.top = 100
              break
            case 'top':
              store.left = 50
              store.top = 0
              break
            case 'left':
              store.left = 0
              store.top = 50
              break
            case 'right':
              store.left = 100
              store.top = 50
              break
          }
          store.mode = 'float'
        }
        else {
          context.panel.store.mode = 'edge'
        }
        setDockContextMenu(null)
      },
      visible: context.clientType === 'embedded',
    },
    {
      label: t('dock.popup'),
      icon: 'i-ph-arrow-square-out-duotone',
      action: () => {
        setDockContextMenu(null)
        requestDockPopupOpen(context)
      },
      visible: isDockPopupSupported() && !useIsDockPopupOpen().value && context.clientType === 'embedded',
    },
  ]
    .filter(item => item.visible)
    .map(({ visible: _, ...item }): DockMenuButton => item)

  const entryItems = getEntryMenuItems(context, entry)
  const items: DockMenuItem[] = entryItems.length && builtinItems.length
    ? [
        ...entryItems,
        { type: 'separator' },
        ...builtinItems,
      ]
    : [
        ...entryItems,
        ...builtinItems,
      ]
  if (items.length === 0)
    return

  setDockContextMenu({
    el,
    gap,
    content: () => h(DockContextMenuList, { items, trigger: el }),
  })
}
