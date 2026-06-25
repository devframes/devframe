import type { ButtonSize, ButtonVariant } from '@internal/design/components'
import { button as buttonClass } from '@internal/design/components'
import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * Button — a thin React shell over the shared `button()` recipe from
 * `@internal/design`, so it renders identically to the Svelte/vanilla buttons
 * in the other built-in plugins.
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

export { Button }
