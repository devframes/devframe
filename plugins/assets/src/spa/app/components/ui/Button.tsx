import type { JSX } from 'preact'
import type { ButtonProps as ButtonClassProps } from '../../design'
import { button } from '../../design'

export interface ButtonProps extends ButtonClassProps, Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'size'> {}

export function Button({ variant, size, class: extra, children, ...rest }: ButtonProps) {
  return (
    <button type="button" class={button({ variant, size, class: extra })} {...rest}>
      {children}
    </button>
  )
}
