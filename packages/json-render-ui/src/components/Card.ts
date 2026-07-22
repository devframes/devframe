import type { JrComponent } from './_shared'
import LayoutCard from '@antfu/design/components/Layout/LayoutCard.vue'
import { h } from 'vue'

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
