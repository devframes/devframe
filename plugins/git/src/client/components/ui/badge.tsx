import type { BadgeVariant } from '../../lib/design'
import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import { badge as badgeClass } from '../../lib/design'
import { cn } from '../../lib/utils'

/** Badge — a React shell over the co-located `@antfu/design` `badge()` helper. */
function Badge({
  className,
  variant = 'secondary',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & {
  variant?: BadgeVariant
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : 'span'
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeClass({ variant }), className)}
      {...props}
    />
  )
}

export { Badge }
