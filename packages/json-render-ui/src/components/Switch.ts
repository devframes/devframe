import type { JrComponent } from './_shared'
import FormSwitch from '@antfu/design/components/Form/FormSwitch.vue'
import { useBoundProp } from '@json-render/vue'
import { h } from 'vue'

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
