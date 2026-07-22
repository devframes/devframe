import type { JrComponent } from './_shared'
import LayoutSeparator from '@antfu/design/components/Layout/LayoutSeparator.vue'
import { h } from 'vue'

export const Divider: JrComponent<{ label?: string }> = ({ props }) =>
  h(LayoutSeparator, { label: props.label })
