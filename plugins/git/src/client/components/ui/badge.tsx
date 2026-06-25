import type { BadgeVariant } from '@internal/design/components'
import { badge as badgeClass } from '@internal/design/components'
import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import { cn } from '../../lib/utils'

/** Badge — a React shell over the shared `badge()` recipe from `@internal/design`. */
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
