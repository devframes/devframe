import type { PropType, VNode } from 'vue'
import type { JrComponent } from './_shared'
import { useBoundProp } from '@json-render/vue'
import { computed, defineComponent, h, ref } from 'vue'
import { Badge } from './Badge'
import { Icon } from './Icon'

interface TabDescriptor {
  value: string
  label: string
  /** Icon name resolved at runtime (e.g. `ph:list`). */
  icon?: string
  badge?: string
  badgeVariant?: 'default' | 'info' | 'success' | 'warning' | 'danger'
}

interface TabsProps {
  /** `children[i]` renders under `tabs[i]`; the two arrays are positional. */
  tabs?: TabDescriptor[]
  /** Two-way bindable via `{ $bindState: '...' }`; otherwise local, uncontrolled. */
  value?: string
  /** Seeds the uncontrolled case only. */
  defaultValue?: string
  orientation?: 'horizontal' | 'vertical'
}

// `@antfu/design`'s LayoutTabs takes a static icon *class*, but tab icons here
// are runtime-resolved *names*, so this is a thin component over the shared
// tokens using Icon. Stateful so uncontrolled selection persists across
// renders; binds to the state store when `bindingPath` is set.
const TabsImpl = defineComponent({
  name: 'JrTabsImpl',
  props: {
    tabs: { type: Array as PropType<TabDescriptor[]>, default: () => [] },
    value: { type: String, default: undefined },
    defaultValue: { type: String, default: undefined },
    orientation: { type: String as PropType<'horizontal' | 'vertical'>, default: 'horizontal' },
    bindingPath: { type: String, default: undefined },
    onChange: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props, { slots }) {
    // `props.value` is already the live bound value; `useBoundProp` is used
    // only for its store setter.
    const [, setBound] = useBoundProp<string>(props.value, props.bindingPath)
    const controlled = props.bindingPath != null
    const local = ref<string | undefined>(props.defaultValue ?? props.value ?? props.tabs[0]?.value)
    const active = computed(() => (controlled ? props.value : local.value))
    const isVertical = computed(() => props.orientation === 'vertical')

    const setActive = (next: string) => {
      if (controlled)
        setBound(next)
      else local.value = next
      props.onChange?.()
    }

    // Roving tabindex + arrow-key navigation per WAI-ARIA.
    const move = (fromIndex: number, delta: number, list: HTMLElement) => {
      const tabs = props.tabs
      if (tabs.length === 0)
        return
      const nextIndex = (fromIndex + delta + tabs.length) % tabs.length
      setActive(tabs[nextIndex]!.value)
      requestAnimationFrame(() => {
        (list.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex])?.focus()
      })
    }

    return () => {
      const tabs = props.tabs
      const activeValue = active.value
      const panels = slots.default?.() ?? []
      const panelArr = (Array.isArray(panels) ? panels : [panels]) as VNode[]
      const activeIndex = tabs.findIndex(tab => tab.value === activeValue)

      const triggers = tabs.map((tab, index) => {
        const isActive = tab.value === activeValue
        return h('button', {
          'type': 'button',
          'role': 'tab',
          'aria-selected': isActive ? 'true' : 'false',
          'tabindex': isActive ? '0' : '-1',
          'class': [
            'inline-flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap outline-none transition focus-visible:ring-2 focus-visible:ring-primary-500/40',
            isVertical.value ? 'border-r-2 -mr-px' : 'border-b-2 -mb-px',
            isActive
              ? 'color-active border-primary-500 dark:border-primary-400 font-medium'
              : 'color-muted border-transparent hover:color-base',
          ],
          'onClick': () => setActive(tab.value),
          'onKeydown': (e: KeyboardEvent) => {
            const list = (e.currentTarget as HTMLElement).parentElement
            if (!list)
              return
            const forward = isVertical.value ? 'ArrowDown' : 'ArrowRight'
            const backward = isVertical.value ? 'ArrowUp' : 'ArrowLeft'
            if (e.key === forward) {
              e.preventDefault()
              move(index, 1, list)
            }
            else if (e.key === backward) {
              e.preventDefault()
              move(index, -1, list)
            }
            else if (e.key === 'Home') {
              e.preventDefault()
              move(index, -index, list)
            }
            else if (e.key === 'End') {
              e.preventDefault()
              move(index, tabs.length - 1 - index, list)
            }
          },
        }, [
          tab.icon ? Icon({ props: { name: tab.icon, size: 14 } } as Parameters<typeof Icon>[0]) : null,
          h('span', tab.label),
          tab.badge ? Badge({ props: { text: tab.badge, variant: tab.badgeVariant ?? 'default' } } as Parameters<typeof Badge>[0]) : null,
        ])
      })

      return h('div', { class: isVertical.value ? 'flex gap-3' : 'flex flex-col gap-2' }, [
        h('div', {
          'role': 'tablist',
          'aria-orientation': props.orientation,
          'class': isVertical.value ? 'flex flex-col border-r border-base shrink-0' : 'flex border-b border-base',
        }, triggers),
        h('div', { role: 'tabpanel', class: 'flex-1 min-w-0' }, activeIndex >= 0 ? [panelArr[activeIndex]] : []),
      ])
    }
  },
})

export const Tabs: JrComponent<TabsProps> = ({ props, children, on, bindings }) =>
  h(TabsImpl, {
    tabs: props.tabs ?? [],
    value: props.value,
    defaultValue: props.defaultValue,
    orientation: props.orientation ?? 'horizontal',
    bindingPath: bindings?.value,
    onChange: () => on('change').emit(),
  }, () => children)
