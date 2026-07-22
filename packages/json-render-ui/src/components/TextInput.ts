import type { JrComponent } from './_shared'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { useBoundProp } from '@json-render/vue'
import { h } from 'vue'

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
