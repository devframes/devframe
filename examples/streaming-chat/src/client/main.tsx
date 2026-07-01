import { render } from 'preact'
import { App } from './app'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

// Shared design tokens flip on the `.dark` class; mirror the OS preference onto
// <html> (the devframe plugins follow the same approach).
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(d: boolean): void {
  document.documentElement.classList.toggle('dark', d)
  document.documentElement.classList.toggle('light', !d)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

const root = document.getElementById('app')
if (!root)
  throw new Error('#app mount node missing from index.html')
render(<App />, root)
