import type { JrComponent } from './_shared'
import { h } from 'vue'

/**
 * Internal placeholder rendered in place of an element whose props failed
 * render-time validation, so one bad element is isolated rather than breaking
 * the whole view. Not part of the public catalog.
 */
export const JsonRenderError: JrComponent<{ message?: string }> = ({ props }) =>
  h('div', {
    class: 'rounded border border-red bg-red:10 color-red text-xs font-mono px2 py1',
    role: 'alert',
  }, props.message ?? 'Invalid element')
