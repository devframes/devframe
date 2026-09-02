import type { PropType } from 'vue'
import type { JrComponent } from './_shared'
import FormCombobox from '@antfu/design/components/Form/FormCombobox.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import { useBoundProp } from '@json-render/vue'
import { computed, defineComponent, h, ref } from 'vue'

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
  /**
   * Renders a real `<select>` instead of `FormSelect`/`FormCombobox`. The browser draws its
   * option list outside the page's layout, so no ancestor can clip or reposition it, making it the
   * dependable choice for a `Select` embedded in a host layout this component doesn't
   * control. Takes priority over `searchable`, which has no native equivalent.
   */
  native?: boolean
}

function normalize(option: string | SelectOption): { value: string, label?: string } {
  return typeof option === 'string' ? { value: option } : { value: option.value, label: option.label }
}

// Stateful inner component: a JrComponent render fn can't hold a ref, so the
// uncontrolled selection (no `$bindState` on `value`) lives here; when the spec
// binds `value`, `bindingPath` is set and writes flow back to the state store.
const SelectImpl = defineComponent({
  name: 'JrSelectImpl',
  props: {
    options: { type: Array as PropType<(string | SelectOption)[]>, default: () => [] },
    value: { type: String, default: undefined },
    placeholder: { type: String, default: undefined },
    label: { type: String, default: undefined },
    disabled: { type: Boolean, default: undefined },
    searchable: { type: Boolean, default: undefined },
    native: { type: Boolean, default: undefined },
    bindingPath: { type: String, default: undefined },
    onChange: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    // `props.value` is already the live resolved value (the provider re-renders
    // on store change); `useBoundProp` is used only for its store setter.
    const [, setBound] = useBoundProp<string>(props.value, props.bindingPath)
    const controlled = props.bindingPath != null
    const local = ref<string | undefined>(props.value)
    const model = computed(() => (controlled ? props.value : local.value))
    const setModel = (next: string | undefined) => {
      if (controlled)
        setBound(next as string)
      else local.value = next
      props.onChange?.()
    }
    const options = computed(() => props.options.map(normalize))
    const withLabel = (control: ReturnType<typeof h>) => {
      if (!props.label)
        return control
      return h('div', { class: 'flex flex-col gap-1' }, [
        h('label', { class: 'text-sm font-medium' }, props.label),
        control,
      ])
    }
    return () => {
      if (props.native) {
        return withLabel(h('select', {
          'value': model.value ?? '',
          'disabled': props.disabled,
          'aria-label': props.label,
          'class': 'text-sm px2.5 h-9 min-w-40 border border-base rounded bg-base color-base outline-none transition disabled:op50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
          'onChange': (e: Event) => setModel((e.target as HTMLSelectElement).value),
        }, [
          // Only while unset, so the placeholder can't be re-selected afterwards.
          props.placeholder && model.value === undefined
            ? h('option', { value: '', disabled: true }, props.placeholder)
            : null,
          ...options.value.map(option => h('option', { value: option.value }, option.label ?? option.value)),
        ]))
      }
      const Comp = (props.searchable ? FormCombobox : FormSelect) as Parameters<typeof h>[0]
      const control = h(Comp, {
        'options': options.value,
        'placeholder': props.placeholder,
        'disabled': props.disabled,
        'modelValue': model.value,
        'onUpdate:modelValue': (next: string) => setModel(next),
      })
      return withLabel(control)
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
    native: props.native,
    bindingPath: bindings?.value,
    onChange: () => on('change').emit(),
  })
