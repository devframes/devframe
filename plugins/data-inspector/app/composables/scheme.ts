import { useDark } from '@vueuse/core'
import { computed } from 'vue'

export type ColorScheme = 'light' | 'dark'
export const isDark = useDark()
export const colorScheme = computed<ColorScheme>(() => isDark.value ? 'dark' : 'light')
