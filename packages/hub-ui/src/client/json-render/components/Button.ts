import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { defineComponent, h } from 'vue'
import DockIcon from '../../components/dock/DockIcon.vue'
import { registryProps } from './types'

type BaseVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS = new Set<BaseVariant>(['primary', 'secondary', 'ghost', 'danger'])

// Maps the JSON-render button variants onto `@antfu/design`'s `ActionButton`
// variants (`primary`/`action`/`text`); `danger` reuses `action` tinted with
// the shared error color.
const VARIANT_MAP: Record<BaseVariant, 'primary' | 'action' | 'text'> = {
  primary: 'primary',
  secondary: 'action',
  ghost: 'text',
  danger: 'action',
}

export interface ButtonProps {
  label?: string
  variant?: BaseVariant
  icon?: string
  disabled?: boolean
  /** Shows a spinner in place of `icon` and implies `disabled`. */
  loading?: boolean
}

export const Button = defineComponent({
  name: 'JrButton',
  props: registryProps<'Button', ButtonProps>(),
  setup(ctx) {
    return () => {
      const { label, icon, variant = 'secondary', disabled, loading } = ctx.element.props
      const press = ctx.on('press')
      const resolved: BaseVariant = VARIANTS.has(variant) ? variant : 'secondary'

      return h(ActionButton, {
        variant: VARIANT_MAP[resolved],
        size: 'sm',
        disabled,
        loading,
        class: resolved === 'danger' ? 'text-red-600! dark:text-red-400!' : undefined,
        onClick: () => press.emit(),
      }, {
        default: () => [
          icon && !loading ? h(DockIcon, { icon, class: 'w-3.5 h-3.5' }) : undefined,
          label,
        ],
      })
    }
  },
})
