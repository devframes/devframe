import type { DevframeMessageEntryFrom, DevframeMessageLevel } from '@devframes/hub/types'

// @unocss-include

export interface LevelStyle {
  icon: string
  color: string
  bg: string
  label: string
}

export interface FromStyle {
  icon: string
  color: string
  label: string
}

export const levels: Record<DevframeMessageLevel, LevelStyle> = {
  info: { icon: 'i-ph:info-duotone', color: 'text-blue', bg: 'bg-blue', label: 'Info' },
  warn: { icon: 'i-ph:warning-duotone', color: 'text-amber', bg: 'bg-amber', label: 'Warning' },
  error: { icon: 'i-ph:x-circle-duotone', color: 'text-red', bg: 'bg-red', label: 'Error' },
  success: { icon: 'i-ph:check-circle-duotone', color: 'text-green', bg: 'bg-green', label: 'Success' },
  debug: { icon: 'i-ph:bug-duotone', color: 'text-gray', bg: 'bg-gray', label: 'Debug' },
}

export const fromEntries: Record<DevframeMessageEntryFrom, FromStyle> = {
  server: { icon: 'i-ph:hexagon-duotone', color: 'text-green-800 dark:text-green-200', label: 'Server' },
  browser: { icon: 'i-ph:globe-simple-duotone', color: 'text-amber-800 dark:text-amber-200', label: 'Browser' },
}

/** Ordering used by the "By severity" sort mode. */
export const levelPriority: Record<DevframeMessageLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  success: 3,
  debug: 4,
}
