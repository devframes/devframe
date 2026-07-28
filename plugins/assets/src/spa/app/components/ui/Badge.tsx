import type { JSX } from 'preact'
import type { BadgeProps as BadgeClassProps } from '../../design'
import { badge } from '../../design'

export interface BadgeProps extends BadgeClassProps, Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'class'> {}

export function Badge({ variant, class: extra, children, ...rest }: BadgeProps) {
  return (
    <span class={badge({ variant, class: extra })} {...rest}>
      {children}
    </span>
  )
}
