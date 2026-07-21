import type { VNodeChild } from 'vue'
import type { JrComponent } from './_shared'
import { useBoundProp } from '@json-render/vue'
import { h } from 'vue'
import { toNumber } from './_shared'

interface KeyValueTableProps {
  data?: Record<string, unknown>
  loading?: boolean
}

function formatValue(value: unknown): string {
  if (value == null)
    return ''
  if (typeof value === 'object')
    return JSON.stringify(value)
  return String(value)
}

export const KeyValueTable: JrComponent<KeyValueTableProps> = ({ props, loading }) => {
  if (loading || props.loading)
    return h('div', { class: 'color-faint text-sm' }, 'Loading…')
  const entries = Object.entries(props.data ?? {})
  return h('table', { class: 'w-full text-sm border-collapse' }, [
    h('tbody', entries.map(([key, value]) =>
      h('tr', { class: 'border-b border-base' }, [
        h('td', { class: 'py1 pr3 color-muted font-medium align-top' }, key),
        h('td', { class: 'py1 color-base font-mono break-all' }, formatValue(value)),
      ]))),
  ])
}

interface DataTableColumn { key: string, label?: string }
interface DataTableProps {
  columns?: (string | DataTableColumn)[]
  rows?: Record<string, unknown>[]
  height?: number
  loading?: boolean
}

function normalizeColumns(columns: DataTableProps['columns'], rows: DataTableProps['rows']): DataTableColumn[] {
  if (columns?.length)
    return columns.map(c => (typeof c === 'string' ? { key: c } : c))
  const first = rows?.[0]
  return first ? Object.keys(first).map(key => ({ key })) : []
}

export const DataTable: JrComponent<DataTableProps> = ({ props, on, bindings, loading }) => {
  if (loading || props.loading)
    return h('div', { class: 'color-faint text-sm' }, 'Loading…')
  const rows = props.rows ?? []
  const columns = normalizeColumns(props.columns, rows)
  const [, setSelected] = useBoundProp<unknown>(undefined, bindings?.value)
  const wrapperStyle = props.height != null ? { maxHeight: `${props.height}px` } : undefined

  return h('div', { class: 'rounded border border-base overflow-auto', style: wrapperStyle }, [
    h('table', { class: 'w-full text-sm border-collapse' }, [
      h('thead', { class: 'sticky top-0 bg-secondary' }, [
        h('tr', columns.map(col =>
          h('th', { class: 'text-left px2 py1.5 color-muted font-medium border-b border-base' }, col.label ?? col.key))),
      ]),
      h('tbody', rows.map((row, index) =>
        h('tr', {
          class: 'border-b border-base hover:bg-secondary cursor-pointer',
          onClick: () => {
            // Deliver row + index into bound state (Vite's rowClick dropped
            // them), then fire the action.
            setSelected({ row, index })
            on('rowClick').emit()
          },
        }, columns.map(col =>
          h('td', { class: 'px2 py1 color-base font-mono' }, formatValue(row[col.key])))))),
    ]),
  ])
}

interface ProgressProps {
  value?: number
  max?: number
  label?: string
}

export const Progress: JrComponent<ProgressProps> = ({ props }) => {
  const max = toNumber(props.max, 100)
  const value = toNumber(props.value, 0)
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return h('div', { class: 'flex flex-col gap-1' }, [
    props.label ? h('div', { class: 'flex justify-between text-xs color-muted' }, [h('span', props.label), h('span', `${Math.round(pct)}%`)]) : null,
    h('div', { class: 'h-2 w-full rounded-full bg-active overflow-hidden' }, [
      h('div', { class: 'h-full rounded-full bg-primary transition-all', style: { width: `${pct}%` } }),
    ]),
  ])
}

interface TreeProps {
  data?: unknown
  defaultExpanded?: boolean
}

function renderNode(value: unknown, keyLabel: string | null, expanded: boolean): VNodeChild {
  const isObject = value !== null && typeof value === 'object'
  if (!isObject) {
    const color = typeof value === 'number'
      ? 'color-primary'
      : typeof value === 'string'
        ? 'color-green'
        : 'color-muted'
    return h('div', { class: 'flex gap-1 font-mono text-sm' }, [
      keyLabel != null ? h('span', { class: 'color-muted' }, `${keyLabel}:`) : null,
      h('span', { class: color }, typeof value === 'string' ? `"${value}"` : String(value)),
    ])
  }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>)
  const summaryLabel = `${keyLabel != null ? `${keyLabel}: ` : ''}${Array.isArray(value) ? `Array(${entries.length})` : 'Object'}`
  return h('details', { class: 'font-mono text-sm', open: expanded }, [
    h('summary', { class: 'cursor-pointer color-muted select-none' }, summaryLabel),
    h('div', { class: 'pl3 border-l border-base ml1' }, entries.map(([k, v]) => renderNode(v, k, expanded))),
  ])
}

export const Tree: JrComponent<TreeProps> = ({ props }) =>
  h('div', { class: 'color-base' }, [renderNode(props.data, null, props.defaultExpanded !== false)])
