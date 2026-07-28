import type { JSX } from 'preact'
import type { IconButtonProps as IconButtonClassProps } from '../../design'
import { iconButton } from '../../design'
import { Icon } from './Icon'

export interface IconButtonProps extends IconButtonClassProps, Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'size'> {
  icon: string
  title: string
}

export function IconButton({ variant, size, class: extra, icon, title, ...rest }: IconButtonProps) {
  return (
    <button type="button" title={title} aria-label={title} class={iconButton({ variant, size, class: extra })} {...rest}>
      <Icon name={icon} />
    </button>
  )
}
