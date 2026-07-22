import type { BaseComponentProps } from '@json-render/vue'
import type { VNodeChild } from 'vue'

/**
 * A base-catalog component render function. Receives the upstream
 * {@link BaseComponentProps} contract (`props`, `children`, `emit`, `on`,
 * `bindings`, `loading`) and returns Vue VNodes. Ported components are plain
 * functions so they need no SFC compiler and can be imported individually.
 */
export type JrComponent<P = Record<string, unknown>> = (
  ctx: BaseComponentProps<P>,
) => VNodeChild

/** Resolve a numeric prop that may arrive as a number or numeric string. */
export function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

/** Render an arbitrary value as a display string for table cells. */
export function formatValue(value: unknown): string {
  if (value == null)
    return ''
  if (typeof value === 'object')
    return JSON.stringify(value)
  return String(value)
}
