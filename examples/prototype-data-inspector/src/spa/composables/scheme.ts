/** PROTOTYPE — color scheme state: OS-initialized, user-togglable. */
import { ref, watchEffect } from 'vue'

export type ColorScheme = 'light' | 'dark'

const mq = window.matchMedia('(prefers-color-scheme: dark)')
export const colorScheme = ref<ColorScheme>(mq.matches ? 'dark' : 'light')
mq.addEventListener('change', (e) => {
  colorScheme.value = e.matches ? 'dark' : 'light'
})

// The shared design tokens flip on the `.dark` class (same approach as the
// other devframe plugins).
watchEffect(() => {
  document.documentElement.classList.toggle('dark', colorScheme.value === 'dark')
  document.documentElement.classList.toggle('light', colorScheme.value === 'light')
})
