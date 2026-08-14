import type { PropType } from 'vue'
import type { JrComponent } from './_shared'
import FormSwitch from '@antfu/design/components/Form/FormSwitch.vue'
import { useBoundProp } from '@json-render/vue'
import { defineComponent, h } from 'vue'
import { useUncontrolledValue } from '../composables/useUncontrolledValue'

interface SwitchProps {
  value?: boolean
  label?: string
  disabled?: boolean
}

// Stateful inner component: a JrComponent render fn can't hold a ref, so the
// uncontrolled value (no `$bindState` on `value`) lives here, session-
// persisted so it survives a reload; when the spec binds `value`,
// `bindingPath` is set and writes flow back to the state store instead.
const SwitchImpl = defineComponent({
  name: 'JrSwitchImpl',
  props: {
    value: { type: Boolean, default: undefined },
    label: { type: String, default: undefined },
    disabled: { type: Boolean, default: undefined },
    bindingPath: { type: String, default: undefined },
    onChange: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    // `props.value` is already the live resolved value; `useBoundProp` is used
    // only for its store setter.
    const [, setBound] = useBoundProp<boolean>(props.value, props.bindingPath)
    const controlled = props.bindingPath != null
    const local = useUncontrolledValue('Switch', { label: props.label }, props.value ?? false)
    const setModel = (next: boolean) => {
      if (controlled)
        setBound(next)
      else local.value = next
      props.onChange?.()
    }
    return () => h(FormSwitch, {
      'modelValue': !!(controlled ? props.value : local.value),
      'onUpdate:modelValue': setModel,
      'label': props.label,
      'disabled': props.disabled,
    })
  },
})

export const Switch: JrComponent<SwitchProps> = ({ props, on, bindings }) =>
  h(SwitchImpl, {
    value: props.value,
    label: props.label,
    disabled: props.disabled,
    bindingPath: bindings?.value,
    onChange: () => on('change').emit(),
  })
