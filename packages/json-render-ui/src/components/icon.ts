import type { JrComponent } from './_shared'
import DisplayIconifyRemoteIcon from '@antfu/design/components/Display/DisplayIconifyRemoteIcon.vue'
import { h } from 'vue'

interface IconProps {
  /** Icon name resolved at runtime, e.g. `ph:rocket-launch`. */
  name?: string
  size?: number
}

/**
 * Fully dynamic icon: wraps `@antfu/design`'s `DisplayIconifyRemoteIcon`, which
 * fetches the (sanitized) SVG from the Iconify API with `color=currentColor` —
 * so the icon inherits the surrounding text color (e.g. white inside a primary
 * button). A deliberate, documented deviation from the repo's Phosphor-first
 * convention, which governs a surface's own chrome, not spec-driven content
 * icons.
 */
export const Icon: JrComponent<IconProps> = ({ props }) => {
  const size = props.size ?? 16
  return h(
    'span',
    {
      class: 'inline-flex shrink-0 items-center justify-center',
      style: { fontSize: `${size}px`, width: `${size}px`, height: `${size}px` },
    },
    props.name ? [h(DisplayIconifyRemoteIcon, { icon: props.name })] : [],
  )
}
