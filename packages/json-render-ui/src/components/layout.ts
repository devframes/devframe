import type { JrComponent } from './_shared'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import LayoutSeparator from '@antfu/design/components/Layout/LayoutSeparator.vue'
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

// A flex layout primitive — `@antfu/design` has no generic Stack, so this stays
// a thin custom component built on the shared tokens.
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

const headerClass = 'flex items-center justify-between px4 py2.5 border-b border-base color-base font-medium text-sm'

// Wraps `@antfu/design` LayoutCard for the bordered surface, composing the
// title/collapsible header on top (LayoutCard is a plain surface).
export const Card: JrComponent<CardProps> = ({ props, children, loading }) => {
  const isLoading = loading || props.loading
  const body = isLoading
    ? h('div', { class: 'color-faint text-sm' }, 'Loading…')
    : (children as any)

  if (props.collapsible) {
    return h(LayoutCard, { padding: false }, () => h('details', { open: !props.defaultCollapsed }, [
      h('summary', { class: `${headerClass} cursor-pointer select-none list-none` }, [
        h('span', props.title ?? ''),
        h('span', { class: 'color-faint text-xs' }, '▾'),
      ]),
      h('div', { class: 'p4' }, [body]),
    ]))
  }

  return h(LayoutCard, { padding: false }, () => [
    props.title ? h('div', { class: headerClass }, props.title) : null,
    h('div', { class: 'p4' }, [body]),
  ])
}

export const Divider: JrComponent<{ label?: string }> = ({ props }) =>
  h(LayoutSeparator, { label: props.label })
