import type * as React from 'react'
import { getFileIcon } from '../../lib/file-icon'
import { cn } from '../../lib/utils'
import { Icon } from './icon'

/**
 * A file-type glyph for a path, mirroring `@antfu/design`'s `FileIcon`
 * (catppuccin icon set). Sizing/color pass through `className`.
 */
export function FileIcon({
  path,
  className,
  ...props
}: { path: string } & Omit<React.ComponentProps<'span'>, 'children'>) {
  return <Icon name={getFileIcon(path)} className={cn('size-4', className)} {...props} />
}
