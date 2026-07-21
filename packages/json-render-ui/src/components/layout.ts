import type { JrComponent } from './_shared'
import { h } from 'vue'
import { toNumber } from './_shared'

interface StackProps {
  direction?: 'row' | 'column'
  gap?: number
  padding?: number
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  wrap?: boolean
  flex?: number | string
}

const alignMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
const justifyMap: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
}

export const Stack: JrComponent<StackProps> = ({ props, children }) => {
  const style: Record<string, string> = {
    display: 'flex',
    flexDirection: props.direction === 'row' ? 'row' : 'column',
    gap: `${toNumber(props.gap, 8)}px`,
  }
  if (props.padding != null)
    style.padding = `${toNumber(props.padding, 0)}px`
  if (props.align)
    style.alignItems = alignMap[props.align] ?? props.align
  if (props.justify)
    style.justifyContent = justifyMap[props.justify] ?? props.justify
  if (props.wrap)
    style.flexWrap = 'wrap'
  if (props.flex != null)
    style.flex = String(props.flex)
  return h('div', { style }, children as any)
}

interface CardProps {
  title?: string
  border?: boolean
  collapsible?: boolean
  defaultCollapsed?: boolean
  loading?: boolean
}

export const Card: JrComponent<CardProps> = ({ props, children, loading }) => {
  const isLoading = loading || props.loading
  const body = isLoading
    ? h('div', { class: 'color-faint text-sm' }, 'Loading…')
    : (children as any)
  const outer = `rounded ${props.border === false ? '' : 'border border-base'} bg-base overflow-hidden`

  // Collapsible uses native <details> so open/closed state persists without a
  // Vue ref (the registry re-invokes this render fn on every update).
  if (props.collapsible) {
    return h('details', { class: outer, open: !props.defaultCollapsed }, [
      h(
        'summary',
        { class: 'flex items-center justify-between px2 py1.5 border-b border-base color-base font-medium text-sm cursor-pointer select-none list-none' },
        [h('span', props.title ?? ''), h('span', { class: 'i-ph:caret-down color-faint' })],
      ),
      h('div', { class: 'p2' }, [body]),
    ])
  }

  return h('div', { class: outer }, [
    props.title
      ? h('div', { class: 'px2 py1.5 border-b border-base color-base font-medium text-sm' }, props.title)
      : null,
    h('div', { class: 'p2' }, [body]),
  ])
}

export const Divider: JrComponent<{ label?: string }> = ({ props }) => {
  if (props.label) {
    return h('div', { class: 'flex items-center gap-2 my-2 color-faint text-xs' }, [
      h('div', { class: 'flex-1 border-t border-base' }),
      h('span', props.label),
      h('div', { class: 'flex-1 border-t border-base' }),
    ])
  }
  return h('div', { class: 'my-2 border-t border-base' })
}
