import type { JSX } from 'preact'

export interface CheckboxProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class' | 'type'> {
  class?: string
}

export function Checkbox({ class: extra, ...rest }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      class={['size-4 rounded border border-base cursor-pointer', extra].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}
