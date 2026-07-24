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
  info: { icon: 'i-ph:info-duotone', color: 'dark:text-blue-200 text-blue-600', bg: 'bg-blue', label: 'Info' },
  warn: { icon: 'i-ph:warning-duotone', color: 'dark:text-amber-200 text-amber-600', bg: 'bg-amber', label: 'Warning' },
  error: { icon: 'i-ph:x-circle-duotone', color: 'dark:text-red-200 text-red-600', bg: 'bg-red', label: 'Error' },
  success: { icon: 'i-ph:check-circle-duotone', color: 'dark:text-green-200 text-green-600', bg: 'bg-green', label: 'Success' },
  debug: { icon: 'i-ph:bug-duotone', color: 'dark:text-violet-200 text-violet-600', bg: 'bg-violet', label: 'Debug' },
}

export const fromEntries: Record<DevframeMessageEntryFrom, FromStyle> = {
  server: { icon: 'i-ph:hexagon-duotone', color: 'text-green-600 dark:text-green-200', label: 'Server' },
  browser: { icon: 'i-ph:globe-simple-duotone', color: 'text-amber-600 dark:text-amber-200', label: 'Browser' },
}

/** Ordering used by the "By severity" sort mode. */
export const levelPriority: Record<DevframeMessageLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  success: 3,
  debug: 4,
}
