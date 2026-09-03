import type * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * A Phosphor icon rendered via UnoCSS `presetIcons`. `name` is an `i-ph-*`
 * class (duotone preferred); pass sizing/color through `className`. Using the
 * shared icon set keeps the Git dashboard visually aligned with the other
 * devframe plugins.
 */
export function Icon({
  name,
  className,
  ...props
}: { name: string } & React.ComponentProps<'span'>) {
  return <span aria-hidden className={cn(name, 'inline-block shrink-0', className)} {...props} />
}
