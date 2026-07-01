/* @refresh reload */
import { render } from 'solid-js/web'
import { App } from './app.tsx'
import 'virtual:uno.css'
import '@antfu/design/styles.css'
import './styles.css'

// Shared design tokens flip on the `.dark` class; mirror the OS preference onto
// <html> (the other devframe plugins follow the same approach).
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyScheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
}
applyScheme(mq.matches)
mq.addEventListener('change', e => applyScheme(e.matches))

const root = document.getElementById('app')
if (!root)
  throw new Error('#app mount node missing from index.html')

render(() => <App />, root)
