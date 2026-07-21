import type { JrComponent } from './_shared'
import { useBoundProp } from '@json-render/vue'
import { h } from 'vue'

interface ButtonProps {
  label?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: string
  disabled?: boolean
  loading?: boolean
}

const buttonBase
  = 'inline-flex items-center gap-1.5 rounded px2.5 py1 text-sm font-medium transition disabled:op-50 disabled:cursor-not-allowed'
const buttonVariant: Record<string, string> = {
  primary: 'bg-primary color-white hover:bg-primary/90',
  secondary: 'bg-secondary color-base border border-base hover:bg-active',
  ghost: 'color-base hover:bg-secondary',
  danger: 'bg-red color-white hover:bg-red/90',
}

export const Button: JrComponent<ButtonProps> = ({ props, on }) => {
  const busy = !!props.loading
  return h(
    'button',
    {
      type: 'button',
      class: `${buttonBase} ${buttonVariant[props.variant ?? 'secondary'] ?? buttonVariant.secondary}`,
      disabled: props.disabled || busy,
      onClick: () => {
        const handle = on('press')
        handle.emit()
      },
    },
    [
      busy
        ? h('span', { class: 'i-ph:spinner animate-spin' })
        : props.icon
          ? h('span', { class: `i-ph:${props.icon}` })
          : null,
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

const fieldBase
  = 'w-full rounded border border-base bg-base color-base px2 py1 text-sm outline-none focus:border-primary disabled:op-50'

export const TextInput: JrComponent<TextInputProps> = ({ props, on, bindings }) => {
  const [value, setValue] = useBoundProp(props.value, bindings?.value)
  const input = h('input', {
    class: fieldBase,
    type: props.type ?? 'text',
    value: value ?? '',
    placeholder: props.placeholder,
    disabled: props.disabled || props.loading,
    onInput: (e: Event) => {
      // Carry the new value into bound state, then fire the `change` action —
      // an improvement over the Vite bridge's payload-free `change`.
      setValue((e.target as HTMLInputElement).value)
      on('change').emit()
    },
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
  const checked = !!value
  const toggle = h('button', {
    'type': 'button',
    'role': 'switch',
    'aria-checked': checked ? 'true' : 'false',
    'disabled': props.disabled,
    'class': `relative inline-flex h-5 w-9 items-center rounded-full transition disabled:op-50 ${checked ? 'bg-primary' : 'bg-active'}`,
    'onClick': () => {
      setValue(!checked)
      on('change').emit()
    },
  }, [
    h('span', { class: `inline-block h-4 w-4 transform rounded-full bg-base shadow transition ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}` }),
  ])
  if (props.label) {
    return h('label', { class: 'inline-flex items-center gap-2 text-sm color-base cursor-pointer' }, [
      toggle,
      h('span', props.label),
    ])
  }
  return toggle
}
