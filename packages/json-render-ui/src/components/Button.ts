import type { JrComponent } from './_shared'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { h } from 'vue'
import { Icon } from './Icon'

interface ButtonProps {
  label?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** Icon name resolved at runtime (e.g. `ph:arrow-clockwise`). */
  icon?: string
  disabled?: boolean
  loading?: boolean
}

// Catalog variant → `@antfu/design` ActionButton variant. `danger` has no
// upstream variant, so it renders as `primary` with a red override.
const buttonVariant: Record<string, string> = {
  primary: 'primary',
  secondary: 'action',
  ghost: 'text',
  danger: 'primary',
}

export const Button: JrComponent<ButtonProps> = ({ props, on }) => {
  const variant = props.variant ?? 'secondary'
  return h(
    ActionButton,
    {
      variant: buttonVariant[variant] ?? 'action',
      disabled: props.disabled,
      loading: props.loading,
      // `danger` isn't an ActionButton variant — override the primary tint.
      class: variant === 'danger' ? 'bg-red! color-white! border-red! hover:bg-red/90!' : undefined,
      onClick: () => on('press').emit(),
    },
    // Render the dynamic Icon in the slot (ActionButton's own `icon` prop is a
    // static UnoCSS class, unsuited to spec-supplied names). Skip it while
    // loading — ActionButton already shows its spinner.
    () => [
      props.icon && !props.loading ? Icon({ props: { name: props.icon, size: 16 } } as Parameters<typeof Icon>[0]) : null,
      props.label ? h('span', props.label) : null,
    ],
  )
}
