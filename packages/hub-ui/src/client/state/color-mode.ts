import { usePreferredDark, useStorage } from '@vueuse/core'
import { computed } from 'vue'

export type ColorSchemePreference = 'auto' | 'light' | 'dark'

/**
 * Shared with plugin SPAs served same-origin under the hub base, so writing
 * this key here propagates into the iframes via `storage` events, so one switch
 * drives the dock shell and every inner integration at once.
 */
const COLOR_SCHEME_STORAGE_KEY = 'devframes-color-scheme'

/** Persisted Auto / Light / Dark choice, defaulting to Auto (follow the OS). */
export const colorSchemePreference = useStorage<ColorSchemePreference>(
  COLOR_SCHEME_STORAGE_KEY,
  'auto',
)

const preferredDark = usePreferredDark()

/** Resolved dark state: `auto` defers to the OS `prefers-color-scheme`. */
export const isDark = computed(() =>
  colorSchemePreference.value === 'auto'
    ? preferredDark.value
    : colorSchemePreference.value === 'dark',
)

export function setColorSchemePreference(preference: ColorSchemePreference) {
  colorSchemePreference.value = preference
}
