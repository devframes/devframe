import type { JrComponent } from './_shared'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import { h } from 'vue'

interface BadgeProps {
  text?: string
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  minWidth?: number
}

// Map the catalog's semantic variants onto `@antfu/design` `DisplayBadge`
// palette color names (`false` = neutral/muted). The resulting
// `badge-color-<name>` classes are safelisted (see the package uno.config and
// the JSON-Render docs) since a spec picks the variant at runtime.
const badgeColor: Record<string, boolean | string> = {
  default: false,
  success: 'green',
  warning: 'amber',
  danger: 'red',
  info: 'blue',
}

export const Badge: JrComponent<BadgeProps> = ({ props, children }) => {
  const style = props.minWidth != null ? { minWidth: `${props.minWidth}px` } : undefined
  return h(
    DisplayBadge,
    { text: props.text, color: badgeColor[props.variant ?? 'default'], style },
    props.text ? undefined : () => children,
  )
}
