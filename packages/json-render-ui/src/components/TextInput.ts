import type { PropType } from 'vue'
import type { JrComponent } from './_shared'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { useBoundProp } from '@json-render/vue'
import { defineComponent, h } from 'vue'
import { useUncontrolledValue } from '../composables/useUncontrolledValue'

interface TextInputProps {
  value?: string
  placeholder?: string
  label?: string
  disabled?: boolean
  type?: 'text' | 'number' | 'password' | 'email' | 'search'
  loading?: boolean
}

// Stateful inner component: a JrComponent render fn can't hold a ref, so the
// uncontrolled value (no `$bindState` on `value`) lives here, session-
// persisted so it survives a reload; when the spec binds `value`,
// `bindingPath` is set and writes flow back to the state store instead.
const TextInputImpl = defineComponent({
  name: 'JrTextInputImpl',
  props: {
    value: { type: String, default: undefined },
    placeholder: { type: String, default: undefined },
    label: { type: String, default: undefined },
    disabled: { type: Boolean, default: undefined },
    type: { type: String as PropType<TextInputProps['type']>, default: 'text' },
    loading: { type: Boolean, default: undefined },
    bindingPath: { type: String, default: undefined },
    onChange: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    // `props.value` is already the live resolved value; `useBoundProp` is used
    // only for its store setter.
    const [, setBound] = useBoundProp<string>(props.value, props.bindingPath)
    const controlled = props.bindingPath != null
    const local = useUncontrolledValue('TextInput', { placeholder: props.placeholder, type: props.type }, props.value ?? '')
    const setModel = (next: string) => {
      if (controlled)
        setBound(next)
      else local.value = next
      props.onChange?.()
    }
    return () => {
      const input = h(FormTextInput, {
        'modelValue': (controlled ? props.value : local.value) ?? '',
        'onUpdate:modelValue': setModel,
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
  },
})

export const TextInput: JrComponent<TextInputProps> = ({ props, on, bindings }) =>
  h(TextInputImpl, {
    value: props.value,
    placeholder: props.placeholder,
    label: props.label,
    disabled: props.disabled,
    type: props.type,
    loading: props.loading,
    bindingPath: bindings?.value,
    onChange: () => on('change').emit(),
  })
