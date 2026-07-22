import type { JrComponent } from './_shared'
import { h } from 'vue'

/** Format a list of prop keys as a compact gist, e.g. `{ foo, bar }`. */
export function formatPropKeys(keys: readonly string[]): string {
  return keys.length ? `{ ${keys.join(', ')} }` : '{}'
}

/**
 * Internal placeholder rendered in place of an element whose `type` is not in
 * the active registry — i.e. a component this frontend does not support. The
 * rest of the view still renders. Not part of the public catalog.
 *
 * Shows three lines using the design system's semantic tokens: a label, the
 * unsupported component type, and a gist of the element's prop keys.
 */
export const JsonRenderUnsupported: JrComponent<{ type?: string, keys?: string[] }> = ({ props }) =>
  h('div', {
    class: 'flex flex-col gap-0.5 rounded border border-base bg-secondary text-xs font-mono px2 py1',
    role: 'note',
  }, [
    h('div', { class: 'color-muted' }, 'Unsupported component'),
    h('div', { class: 'color-base font-semibold' }, props.type ?? 'unknown'),
    h('div', { class: 'color-faint' }, formatPropKeys(props.keys ?? [])),
  ])
