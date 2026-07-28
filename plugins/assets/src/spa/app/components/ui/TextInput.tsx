import type { JSX } from 'preact'
import { input } from '../../design'

export interface TextInputProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class'> {
  class?: string
}

export function TextInput({ class: extra, ...rest }: TextInputProps) {
  return <input class={input(extra)} {...rest} />
}
