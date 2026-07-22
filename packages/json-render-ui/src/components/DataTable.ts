import type { JrComponent } from './_shared'
import { useBoundProp } from '@json-render/vue'
import { h } from 'vue'
import { formatValue } from './_shared'

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

// `@antfu/design` LayoutDataTable has no per-row click or loading state, both of
// which the catalog requires (`rowClick`, `loading`), so this stays custom on
// the shared tokens. (A candidate to contribute back upstream.)
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
            // Deliver row + index into bound state, then fire the action.
            setSelected({ row, index })
            on('rowClick').emit()
          },
        }, columns.map(col =>
          h('td', { class: 'px2 py1 color-base font-mono' }, formatValue(row[col.key])))))),
    ]),
  ])
}
