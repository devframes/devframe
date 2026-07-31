import { createApp } from 'vue'
import App from './app/App.vue'
import 'virtual:uno.css'
import 'floating-vue/dist/style.css'
import '@antfu/design/styles.css'

// Shared design tokens flip on the `.dark` class; mirror the OS preference
// onto <html> (the built-in devframe plugins all follow this approach).
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

createApp(App).mount('#app')
