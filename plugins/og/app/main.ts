import { createApp } from 'vue'
import { applyPanelBranding } from '../../../design/panel-theme'
import App from './app/app.vue'
import '../../../packages/hub-ui/src/client/primary-ramp.css'

const media = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
}
applyScheme(media.matches)
media.addEventListener('change', event => applyScheme(event.matches))

createApp(App).mount('#app')

const stopPanelTheme = applyPanelBranding()
import.meta.hot?.dispose(stopPanelTheme)
