import type { JrComponent } from './_shared'
import DisplayKeyValue from '@antfu/design/components/Display/DisplayKeyValue.vue'
import { h } from 'vue'
import { formatValue } from './_shared'

interface KeyValueTableProps {
  data?: Record<string, unknown>
  loading?: boolean
}

// Renders each entry as an `@antfu/design` DisplayKeyValue row.
export const KeyValueTable: JrComponent<KeyValueTableProps> = ({ props, loading }) => {
  if (loading || props.loading)
    return h('div', { class: 'color-faint text-sm' }, 'Loading…')
  const entries = Object.entries(props.data ?? {})
  return h('div', { class: 'flex flex-col gap-1' }, entries.map(([key, value]) =>
    h(DisplayKeyValue, { key, label: key, value: formatValue(value) })))
}
