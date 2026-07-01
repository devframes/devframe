import { createApp } from 'vue'
import App from './App.vue'
import 'virtual:uno.css'
import 'floating-vue/dist/style.css'
import '@antfu/design/styles.css'
import './style.css'

// The shared design tokens flip on the `.dark` class; mirror the OS preference
// onto <html> (the other devframe plugins follow the same approach).
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

createApp(App).mount('#app')
