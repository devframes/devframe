import type { JrComponent } from './_shared'
import DisplayProgressBar from '@antfu/design/components/Display/DisplayProgressBar.vue'
import { h } from 'vue'
import { toNumber } from './_shared'

interface ProgressProps {
  value?: number
  max?: number
  label?: string
}

// Wraps `@antfu/design` DisplayProgressBar (which takes a 0–1 ratio), adding the
// catalog's visible label + percentage row.
export const Progress: JrComponent<ProgressProps> = ({ props }) => {
  const max = toNumber(props.max, 100)
  const value = toNumber(props.value, 0)
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return h('div', { class: 'flex flex-col gap-1' }, [
    props.label
      ? h('div', { class: 'flex justify-between text-xs color-muted' }, [h('span', props.label), h('span', `${Math.round(ratio * 100)}%`)])
      : null,
    h(DisplayProgressBar, { value: ratio, label: props.label }),
  ])
}
