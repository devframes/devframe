import type {
  ButtonSize,
  ButtonVariant,
  IconButtonSize,
  IconButtonVariant,
} from '@internal/design/components'
import { button as buttonClass, iconButton as iconButtonClass } from '@internal/design/components'
import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * The three button forms, as thin React shells over the shared recipes from
 * `@internal/design`, so they render identically to the Svelte/vanilla/Vue
 * buttons in the other built-in plugins:
 *
 * - `<Button>` — a text button (label, optionally with a leading icon).
 * - `<IconButton>` — a square icon-only button; bordered by default,
 *   borderless with `variant="ghost"`.
 */
function Button({
  className,
  variant = 'primary',
  size = 'md',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonClass({ variant, size }), className)}
      {...props}
    />
  )
}

function IconButton({
  className,
  variant = 'outline',
  size = 'md',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & {
  variant?: IconButtonVariant
  size?: IconButtonSize
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="icon-button"
      className={cn(iconButtonClass({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, IconButton }
