import { render } from 'preact'
import { App } from './app/App'
import '@antfu/design/styles.css'
import 'virtual:uno.css'

// Shared design tokens flip on the `.dark` class; mirror the OS preference
// onto <html> (the built-in devframe plugins all follow this approach).
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

const root = document.getElementById('app')
if (!root)
  throw new Error('#app mount node missing from index.html')
render(<App />, root)
