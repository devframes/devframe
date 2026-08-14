import type { PropType } from 'vue'
import type { JrComponent } from './_shared'
import FormCombobox from '@antfu/design/components/Form/FormCombobox.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import { useBoundProp } from '@json-render/vue'
import { computed, defineComponent, h } from 'vue'
import { useUncontrolledValue } from '../composables/useUncontrolledValue'

interface SelectOption {
  value: string
  label?: string
  /** Icon/description are accepted by the catalog but not rendered by the reference select. */
  icon?: string
  description?: string
}

interface SelectProps {
  value?: string
  options?: (string | SelectOption)[]
  placeholder?: string
  label?: string
  disabled?: boolean
  /** Swap the plain select for a searchable combobox. */
  searchable?: boolean
}

function normalize(option: string | SelectOption): { value: string, label?: string } {
  return typeof option === 'string' ? { value: option } : { value: option.value, label: option.label }
}

// Stateful inner component: a JrComponent render fn can't hold a ref, so the
// uncontrolled selection (no `$bindState` on `value`) lives here, session-
// persisted so it survives a reload; when the spec binds `value`,
// `bindingPath` is set and writes flow back to the state store instead.
const SelectImpl = defineComponent({
  name: 'JrSelectImpl',
  props: {
    options: { type: Array as PropType<(string | SelectOption)[]>, default: () => [] },
    value: { type: String, default: undefined },
    placeholder: { type: String, default: undefined },
    label: { type: String, default: undefined },
    disabled: { type: Boolean, default: undefined },
    searchable: { type: Boolean, default: undefined },
    bindingPath: { type: String, default: undefined },
    onChange: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    // `props.value` is already the live resolved value (the provider re-renders
    // on store change); `useBoundProp` is used only for its store setter.
    const [, setBound] = useBoundProp<string>(props.value, props.bindingPath)
    const controlled = props.bindingPath != null
    const local = useUncontrolledValue<string | undefined>(
      'Select',
      { options: props.options, searchable: props.searchable },
      props.value,
    )
    const model = computed(() => (controlled ? props.value : local.value))
    const setModel = (next: string | undefined) => {
      if (controlled)
        setBound(next as string)
      else local.value = next
      props.onChange?.()
    }
    const options = computed(() => props.options.map(normalize))
    return () => {
      const Comp = (props.searchable ? FormCombobox : FormSelect) as unknown as Parameters<typeof h>[0]
      const control = h(Comp, {
        'options': options.value,
        'placeholder': props.placeholder,
        'disabled': props.disabled,
        'modelValue': model.value,
        'onUpdate:modelValue': (next: string) => setModel(next),
      })
      if (props.label) {
        return h('div', { class: 'flex flex-col gap-1' }, [
          h('label', { class: 'text-sm font-medium' }, props.label),
          control,
        ])
      }
      return control
    }
  },
})

export const Select: JrComponent<SelectProps> = ({ props, on, bindings }) =>
  h(SelectImpl, {
    options: props.options ?? [],
    value: props.value,
    placeholder: props.placeholder,
    label: props.label,
    disabled: props.disabled,
    searchable: props.searchable,
    bindingPath: bindings?.value,
    onChange: () => on('change').emit(),
  })
