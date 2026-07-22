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
