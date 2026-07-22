import type { VNodeChild } from 'vue'
import type { JrComponent } from './_shared'
import { h } from 'vue'

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

// `@antfu/design` DisplayTree nests a flat path list (file/folder style), not an
// arbitrary JSON value, so the catalog's value-tree viewer stays custom.
export const Tree: JrComponent<TreeProps> = ({ props }) =>
  h('div', { class: 'color-base' }, [renderNode(props.data, null, props.defaultExpanded !== false)])
