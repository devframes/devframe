import type { JrComponent } from './_shared'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FormSwitch from '@antfu/design/components/Form/FormSwitch.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { useBoundProp } from '@json-render/vue'
import { h } from 'vue'
import { Icon } from './icon'

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

interface TextInputProps {
  value?: string
  placeholder?: string
  label?: string
  disabled?: boolean
  type?: 'text' | 'number' | 'password' | 'email' | 'search'
  loading?: boolean
}

export const TextInput: JrComponent<TextInputProps> = ({ props, on, bindings }) => {
  const [value, setValue] = useBoundProp(props.value, bindings?.value)
  const input = h(FormTextInput, {
    'modelValue': value ?? '',
    'onUpdate:modelValue': (next: string) => {
      // Carry the new value into bound state, then fire the `change` action.
      setValue(next)
      on('change').emit()
    },
    'placeholder': props.placeholder,
    'type': props.type ?? 'text',
    'disabled': props.disabled || props.loading,
  })
  if (props.label) {
    return h('label', { class: 'flex flex-col gap-1 text-sm color-muted' }, [
      h('span', props.label),
      input,
    ])
  }
  return input
}

interface SwitchProps {
  value?: boolean
  label?: string
  disabled?: boolean
}

export const Switch: JrComponent<SwitchProps> = ({ props, on, bindings }) => {
  const [value, setValue] = useBoundProp(props.value, bindings?.value)
  return h(FormSwitch, {
    'modelValue': !!value,
    'onUpdate:modelValue': (next: boolean) => {
      setValue(next)
      on('change').emit()
    },
    'label': props.label,
    'disabled': props.disabled,
  })
}
